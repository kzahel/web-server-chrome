package app.ok200.android.server

import app.ok200.android.server.storage.FilesystemFileTree
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.io.path.createSymbolicLinkPointingTo
import kotlin.io.path.writeText
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KotlinHttpServerTest {
    private val servers = mutableListOf<KotlinHttpServer>()
    private val roots = mutableListOf<File>()

    @After
    fun tearDown() {
        servers.forEach(KotlinHttpServer::stop)
        roots.forEach(File::deleteRecursively)
    }

    @Test
    fun servesFilesHeadCachingAndRanges() {
        val root = rootWithFiles("hello.txt" to "0123456789")
        val server = start(root)

        val get = request(server, "GET", "/hello.txt")
        assertEquals(200, get.status)
        assertEquals("0123456789", get.text())
        assertEquals("text/plain; charset=utf-8", get.header("content-type"))
        assertEquals("bytes", get.header("accept-ranges"))
        assertNotNull(get.header("last-modified"))
        val etag = requireNotNull(get.header("etag"))

        val head = request(server, "HEAD", "/hello.txt", readBody = false)
        assertEquals(200, head.status)
        assertEquals("10", head.header("content-length"))
        assertTrue(head.body.isEmpty())

        val cached = request(server, "GET", "/hello.txt", mapOf("If-None-Match" to etag))
        assertEquals(304, cached.status)
        assertTrue(cached.body.isEmpty())

        val bounded = request(server, "GET", "/hello.txt", mapOf("Range" to "bytes=2-5"))
        assertEquals(206, bounded.status)
        assertEquals("2345", bounded.text())
        assertEquals("bytes 2-5/10", bounded.header("content-range"))

        assertEquals("789", request(server, "GET", "/hello.txt", mapOf("Range" to "bytes=-3")).text())
        assertEquals("789", request(server, "GET", "/hello.txt", mapOf("Range" to "bytes=7-")).text())

        val invalid = request(server, "GET", "/hello.txt", mapOf("Range" to "bytes=20-30"))
        assertEquals(416, invalid.status)
        assertEquals("bytes */10", invalid.header("content-range"))
        assertEquals(416, request(server, "GET", "/hello.txt", mapOf("Range" to "bytes=0-1,4-5")).status)
    }

    @Test
    fun handlesIndexListingsCorsSpaAndMethods() {
        val root = rootWithFiles(
            "index.html" to "<main>app</main>",
            "folder/a file.txt" to "a",
            "folder/<unsafe>&.txt" to "b"
        )
        val server = start(root, HttpServerConfig(port = 0, cors = true, spa = true))

        assertEquals("<main>app</main>", request(server, "GET", "/").text())
        assertEquals("<main>app</main>", request(server, "GET", "/client/route").text())

        val listing = request(server, "GET", "/folder/")
        assertEquals(200, listing.status)
        assertTrue(listing.text().contains("a%20file.txt"))
        assertTrue(listing.text().contains("&lt;unsafe&gt;&amp;.txt"))
        assertFalse(listing.text().contains("<unsafe>"))
        assertEquals("*", listing.header("access-control-allow-origin"))

        val options = request(server, "OPTIONS", "/anything")
        assertEquals(204, options.status)
        assertEquals("GET, HEAD, OPTIONS", options.header("access-control-allow-methods"))

        val post = request(server, "POST", "/")
        assertEquals(405, post.status)
        assertEquals("GET, HEAD, OPTIONS", post.header("allow"))
    }

    @Test
    fun listingAndSpaCanBeDisabled() {
        val root = rootWithFiles("index.html" to "app", "folder/file.txt" to "value")
        val server = start(
            root,
            HttpServerConfig(port = 0, directoryListing = false, spa = false, cors = false)
        )

        assertEquals(404, request(server, "GET", "/folder/").status)
        assertEquals(404, request(server, "GET", "/missing").status)
        val options = request(server, "OPTIONS", "/")
        assertEquals(405, options.status)
        assertEquals(null, options.header("access-control-allow-origin"))
    }

    @Test
    fun rejectsMalformedTraversalAndOversizedRequests() {
        val root = rootWithFiles("safe.txt" to "safe")
        val server = start(root, HttpServerConfig(port = 0, maxHeaderBytes = 1024))

        for (path in listOf("/../secret", "/%2e%2e/secret", "/bad%ZZ", "/a%00b", "/a%5cb", "//host/path")) {
            assertEquals(path, 400, request(server, "GET", path).status)
        }

        val raw = "GET / HTTP/1.1\r\nHost: localhost\r\nX-Large: ${"x".repeat(1100)}\r\n\r\n"
        assertEquals(431, rawRequest(server, raw).status)
    }

    @Test
    fun supportsKeepAliveConcurrentClientsAndIdempotentStop() {
        val root = rootWithFiles("value.txt" to "value")
        val server = start(root)
        val info = requireNotNull(server.currentInfo())
        assertTrue(info.port > 0)

        Socket("127.0.0.1", info.port).use { socket ->
            socket.soTimeout = 2_000
            val output = BufferedOutputStream(socket.getOutputStream())
            val input = BufferedInputStream(socket.getInputStream())
            output.write("GET /value.txt HTTP/1.1\r\nHost: localhost\r\n\r\n".toByteArray())
            output.flush()
            assertEquals("value", readResponse(input, readBody = true).text())
            output.write("GET /value.txt HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".toByteArray())
            output.flush()
            assertEquals("value", readResponse(input, readBody = true).text())
        }

        val executor = Executors.newFixedThreadPool(8)
        try {
            val results = executor.invokeAll(
                (1..32).map { Callable { request(server, "GET", "/value.txt").text() } }
            )
            assertTrue(results.all { it.get() == "value" })
        } finally {
            executor.shutdownNow()
        }

        server.stop()
        server.stop()
        assertEquals(null, server.currentInfo())
    }

    @Test
    fun filesystemBackendContainsSymlinks() {
        val root = rootWithFiles("inside.txt" to "inside")
        val outside = Files.createTempFile("ok200-outside", ".txt")
        outside.writeText("outside")
        try {
            root.toPath().resolve("escape.txt").createSymbolicLinkPointingTo(outside)
            val server = start(root)
            assertEquals(404, request(server, "GET", "/escape.txt").status)
            assertEquals("inside", request(server, "GET", "/inside.txt").text())
        } finally {
            Files.deleteIfExists(outside)
        }
    }

    private fun rootWithFiles(vararg files: Pair<String, String>): File {
        val root = Files.createTempDirectory("ok200-server-test").toFile()
        roots += root
        files.forEach { (path, value) ->
            File(root, path).apply {
                parentFile?.mkdirs()
                writeText(value)
            }
        }
        return root
    }

    private fun start(root: File, config: HttpServerConfig = HttpServerConfig(port = 0)): KotlinHttpServer {
        return KotlinHttpServer(FilesystemFileTree(root), config).also {
            servers += it
            it.start()
        }
    }

    private fun request(
        server: KotlinHttpServer,
        method: String,
        path: String,
        headers: Map<String, String> = emptyMap(),
        readBody: Boolean = true
    ): TestResponse {
        val request = buildString {
            append("$method $path HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n")
            headers.forEach { (name, value) -> append("$name: $value\r\n") }
            append("\r\n")
        }
        return rawRequest(server, request, readBody)
    }

    private fun rawRequest(server: KotlinHttpServer, request: String, readBody: Boolean = true): TestResponse {
        val port = requireNotNull(server.currentInfo()).port
        return Socket("127.0.0.1", port).use { socket ->
            socket.soTimeout = 2_000
            socket.getOutputStream().write(request.toByteArray(StandardCharsets.ISO_8859_1))
            socket.getOutputStream().flush()
            readResponse(BufferedInputStream(socket.getInputStream()), readBody)
        }
    }

    private fun readResponse(input: BufferedInputStream, readBody: Boolean): TestResponse {
        val head = ByteArrayOutputStream()
        var matched = 0
        while (matched != 4) {
            val value = input.read()
            check(value >= 0) { "Unexpected EOF reading response headers" }
            head.write(value)
            matched = when {
                matched == 0 && value == '\r'.code -> 1
                matched == 1 && value == '\n'.code -> 2
                matched == 2 && value == '\r'.code -> 3
                matched == 3 && value == '\n'.code -> 4
                value == '\r'.code -> 1
                else -> 0
            }
        }
        val lines = head.toString(StandardCharsets.ISO_8859_1.name())
            .removeSuffix("\r\n\r\n")
            .split("\r\n")
        val status = lines.first().split(' ')[1].toInt()
        val headers = lines.drop(1).associate { line ->
            val colon = line.indexOf(':')
            line.substring(0, colon).lowercase() to line.substring(colon + 1).trim()
        }
        val length = headers["content-length"]?.toInt() ?: 0
        val body = if (readBody) input.readNBytes(length) else byteArrayOf()
        return TestResponse(status, headers, body)
    }

    private data class TestResponse(
        val status: Int,
        val headers: Map<String, String>,
        val body: ByteArray
    ) {
        fun header(name: String): String? = headers[name.lowercase()]
        fun text(): String = body.toString(StandardCharsets.UTF_8)
    }
}
