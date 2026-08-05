package app.ok200.android.server

import app.ok200.android.server.storage.FilesystemFileTree
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.io.path.createSymbolicLinkPointingTo
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpConformanceTest {
    private val temporaryDirectories = mutableListOf<File>()

    @After
    fun tearDown() {
        temporaryDirectories.forEach(File::deleteRecursively)
    }

    @Test
    fun passesSharedHttpConformanceV1() {
        val corpus = Json.decodeFromString<Corpus>(corpusFile().readText())
        assertEquals(1, corpus.schemaVersion)
        assertTrue("kotlin" in corpus.runtimes)
        val root = buildFixture(corpus.fixture)
        var claimed = 0

        corpus.cases.forEach { case ->
            if ("kotlin" !in case.claims) {
                assertNotNull("${case.id}: missing Kotlin exclusion", case.exclusions["kotlin"])
                return@forEach
            }
            claimed++
            val configuration = requireNotNull(corpus.configurations[case.configuration]) {
                "${case.id}: missing configuration"
            }
            runCase(case, configuration, root)
        }

        println("HTTP conformance ${corpus.contractVersion}: kotlin claimed $claimed cases")
    }

    private fun corpusFile(): File {
        val start = File(requireNotNull(System.getProperty("user.dir"))).absoluteFile
        return generateSequence(start, File::getParentFile)
            .map { File(it, "tests/http-conformance/corpus-v1.json") }
            .firstOrNull(File::isFile)
            ?: error("Could not find tests/http-conformance/corpus-v1.json from $start")
    }

    private fun buildFixture(specification: ContractFixture): File {
        val root = Files.createTempDirectory("ok200-conformance-root").toFile()
        val outside = Files.createTempDirectory("ok200-conformance-outside").toFile()
        temporaryDirectories += root
        temporaryDirectories += outside
        specification.directories.forEach { File(root, it).mkdirs() }
        specification.files.forEach { file ->
            File(root, file.path).apply {
                parentFile?.mkdirs()
                writeText(file.utf8)
            }
        }
        specification.symlinkEscapes.forEachIndexed { index, link ->
            val target = File(outside, "outside-$index.txt").apply { writeText(link.outsideUtf8) }
            File(root, link.path).toPath().createSymbolicLinkPointingTo(target.toPath())
        }
        return root
    }

    private fun runCase(case: ContractCase, source: ContractConfiguration, root: File) {
        when (case.kind) {
            "request" -> withServer(root, source) { server ->
                val request = resolveRequest(server, requireNotNull(case.request))
                assertResponse(case, request(server, request))
            }

            "oversizedHead" -> withServer(root, source) { server ->
                val raw = buildString {
                    append("GET / HTTP/1.1\r\nHost: localhost\r\nX-Oversized: ")
                    append("x".repeat(requireNotNull(case.oversizedHeaderBytes)))
                    append("\r\nConnection: close\r\n\r\n")
                }
                assertResponse(case, rawRequest(server, raw, readBody = true))
            }

            "concurrency" -> withServer(root, source) { server ->
                val request = requireNotNull(case.request)
                val count = requireNotNull(case.concurrency)
                val executor = Executors.newFixedThreadPool(count)
                try {
                    val results = executor.invokeAll(
                        (1..count).map { Callable { request(server, request) } }
                    )
                    results.forEach { assertResponse(case, it.get()) }
                } finally {
                    executor.shutdownNow()
                }
            }

            "restart" -> {
                val first = startServer(root, source)
                assertTrue("${case.id}: automatic port", requireNotNull(first.currentInfo()).port > 0)
                first.stop()
                val second = startServer(root, source)
                try {
                    assertResponse(
                        case,
                        request(second, ContractRequest(method = "GET", target = "/"))
                    )
                } finally {
                    second.stop()
                }
            }

            else -> error("${case.id}: unsupported case kind ${case.kind}")
        }
    }

    private fun withServer(
        root: File,
        configuration: ContractConfiguration,
        body: (KotlinHttpServer) -> Unit
    ) {
        val server = startServer(root, configuration)
        try {
            body(server)
        } finally {
            server.stop()
        }
    }

    private fun startServer(root: File, source: ContractConfiguration): KotlinHttpServer =
        KotlinHttpServer(
            FilesystemFileTree(root, "Conformance fixture must be readable"),
            HttpServerConfig(
                port = 0,
                cors = source.cors,
                spa = source.spa,
                directoryListing = source.directoryListing
            )
        ).also(KotlinHttpServer::start)

    private fun resolveRequest(server: KotlinHttpServer, source: ContractRequest): ContractRequest {
        val headers = source.headers.mapValues { (_, value) ->
            val placeholder = value.takeIf { it.startsWith('$') }?.removePrefix("$")
            val parts = placeholder?.split(':', limit = 2)
            if (parts?.size != 2) return@mapValues value
            val preflight = request(server, ContractRequest(method = "GET", target = parts[1]))
            val header = when (parts[0]) {
                "etag" -> "etag"
                "last-modified" -> "last-modified"
                else -> error("Unknown header placeholder ${parts[0]}")
            }
            requireNotNull(preflight.header(header)) { "Missing preflight header $header" }
        }
        return source.copy(headers = headers)
    }

    private fun request(server: KotlinHttpServer, request: ContractRequest): TestResponse {
        val raw = buildString {
            append("${request.method} ${request.target} HTTP/1.1\r\n")
            append("Host: localhost\r\n")
            request.headers.forEach { (name, value) -> append("$name: $value\r\n") }
            append("Connection: close\r\n\r\n")
        }
        return rawRequest(server, raw, readBody = request.method != "HEAD")
    }

    private fun rawRequest(server: KotlinHttpServer, request: String, readBody: Boolean): TestResponse {
        val port = requireNotNull(server.currentInfo()).port
        return Socket("127.0.0.1", port).use { socket ->
            socket.soTimeout = 3_000
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
            check(value >= 0) { "Unexpected EOF reading conformance response headers" }
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

    private fun assertResponse(case: ContractCase, response: TestResponse) {
        val expectation = case.expect
        assertTrue("${case.id}: unexpected status ${response.status}", response.status in expectation.statuses)
        val body = response.text()
        expectation.bodyEquals?.let { assertEquals("${case.id}: body", it, body) }
        if (expectation.bodyEmpty == true) assertTrue("${case.id}: expected empty body", response.body.isEmpty())
        expectation.bodyContains.forEach { assertTrue("${case.id}: body missing $it", body.contains(it)) }
        expectation.bodyExcludes.forEach { assertFalse("${case.id}: body contained $it", body.contains(it)) }
        expectation.headersPresent.forEach { assertNotNull("${case.id}: missing header $it", response.header(it)) }
        expectation.headersAbsent.forEach { assertEquals("${case.id}: unexpected header $it", null, response.header(it)) }
        expectation.headersEqual.forEach { (name, value) ->
            assertEquals("${case.id}: header $name", value, response.header(name))
        }
        expectation.headersPrefix.forEach { (name, prefix) ->
            assertTrue(
                "${case.id}: header $name did not start with $prefix",
                response.header(name)?.startsWith(prefix) == true
            )
        }
    }

    @Serializable
    private data class Corpus(
        val schemaVersion: Int,
        val contractVersion: String,
        val runtimes: List<String>,
        val configurations: Map<String, ContractConfiguration>,
        val fixture: ContractFixture,
        val cases: List<ContractCase>
    )

    @Serializable
    private data class ContractConfiguration(
        val cors: Boolean,
        val spa: Boolean,
        val directoryListing: Boolean
    )

    @Serializable
    private data class ContractFixture(
        val directories: List<String>,
        val files: List<FixtureFile>,
        val symlinkEscapes: List<FixtureSymlink>
    )

    @Serializable
    private data class FixtureFile(val path: String, val utf8: String)

    @Serializable
    private data class FixtureSymlink(val path: String, val outsideUtf8: String)

    @Serializable
    private data class ContractCase(
        val id: String,
        val kind: String,
        val configuration: String,
        val request: ContractRequest? = null,
        val concurrency: Int? = null,
        val oversizedHeaderBytes: Int? = null,
        val claims: List<String>,
        val exclusions: Map<String, String>,
        val expect: ContractExpectation
    )

    @Serializable
    private data class ContractRequest(
        val method: String,
        val target: String,
        val headers: Map<String, String> = emptyMap()
    )

    @Serializable
    private data class ContractExpectation(
        val statuses: List<Int>,
        val bodyEquals: String? = null,
        val bodyEmpty: Boolean? = null,
        val bodyContains: List<String> = emptyList(),
        val bodyExcludes: List<String> = emptyList(),
        val headersPresent: List<String> = emptyList(),
        val headersAbsent: List<String> = emptyList(),
        val headersEqual: Map<String, String> = emptyMap(),
        val headersPrefix: Map<String, String> = emptyMap()
    )

    private data class TestResponse(
        val status: Int,
        val headers: Map<String, String>,
        val body: ByteArray
    ) {
        fun header(name: String): String? = headers[name.lowercase()]
        fun text(): String = body.toString(StandardCharsets.UTF_8)
    }
}
