package app.ok200.android.server

import app.ok200.android.server.storage.ReadOnlyFileTree
import app.ok200.android.server.storage.TreeEntry
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.URLConnection
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Bounded, read-only HTTP/1.x server for Android.
 *
 * The protocol implementation has no Android dependencies. Blocking filesystem
 * and socket work runs on Dispatchers.IO and concurrent connections are capped.
 */
class KotlinHttpServer(
    private val tree: ReadOnlyFileTree,
    private val config: HttpServerConfig,
    private val onRequest: (RequestLog) -> Unit = {}
) : Closeable {
    private val lifecycleLock = Any()
    private val running = AtomicBoolean(false)
    private val connections = ConcurrentHashMap.newKeySet<Socket>()
    private var serverSocket: ServerSocket? = null
    private var scope: CoroutineScope? = null
    private var info: HttpServerInfo? = null

    fun start(): HttpServerInfo = synchronized(lifecycleLock) {
        info?.let { return it }

        val listener = ServerSocket().apply {
            reuseAddress = true
            bind(InetSocketAddress(InetAddress.getByName(config.host), config.port))
        }
        val serverScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val permits = Semaphore(config.maxConnections)
        val started = HttpServerInfo(config.host, config.port, listener.localPort)

        serverSocket = listener
        scope = serverScope
        info = started
        running.set(true)

        serverScope.launch {
            while (isActive && running.get()) {
                val socket = try {
                    listener.accept()
                } catch (_: SocketException) {
                    break
                } catch (_: IOException) {
                    if (!running.get()) break
                    continue
                }

                if (!permits.tryAcquire()) {
                    rejectBusy(socket)
                    continue
                }

                connections.add(socket)
                launch {
                    try {
                        handleConnection(socket)
                    } finally {
                        connections.remove(socket)
                        runCatching { socket.close() }
                        permits.release()
                    }
                }
            }
        }

        started
    }

    fun currentInfo(): HttpServerInfo? = info

    fun stop() {
        val listener: ServerSocket?
        val serverScope: CoroutineScope?
        synchronized(lifecycleLock) {
            if (!running.getAndSet(false) && info == null) return
            listener = serverSocket
            serverScope = scope
            serverSocket = null
            scope = null
            info = null
        }

        runCatching { listener?.close() }
        connections.toList().forEach { socket -> runCatching { socket.close() } }
        connections.clear()
        serverScope?.cancel()
        runCatching { tree.close() }
    }

    override fun close() = stop()

    private fun rejectBusy(socket: Socket) {
        runCatching {
            socket.soTimeout = config.requestTimeoutMillis
            BufferedOutputStream(socket.getOutputStream()).use { output ->
                writeResponse(
                    output,
                    Response.text(503, "Service Unavailable", "Service Unavailable"),
                    keepAlive = false,
                    includeBody = true
                )
            }
        }
        runCatching { socket.close() }
    }

    private fun handleConnection(socket: Socket) {
        socket.soTimeout = config.requestTimeoutMillis
        socket.tcpNoDelay = true
        val input = BufferedInputStream(socket.getInputStream())
        val output = BufferedOutputStream(socket.getOutputStream())
        var requestsOnConnection = 0

        while (running.get() && requestsOnConnection < MAX_REQUESTS_PER_CONNECTION) {
            val request = try {
                readRequest(input) ?: break
            } catch (_: SocketTimeoutException) {
                break
            } catch (error: HttpParseException) {
                writeResponse(
                    output,
                    Response.text(error.status, error.reason, error.publicMessage),
                    keepAlive = false,
                    includeBody = true
                )
                break
            } catch (_: IOException) {
                break
            }

            requestsOnConnection++
            val startedAt = System.nanoTime()
            var failure: String? = null
            val response = try {
                serve(request)
            } catch (error: HttpParseException) {
                Response.text(error.status, error.reason, error.publicMessage)
            } catch (error: SecurityException) {
                failure = error.message ?: error.javaClass.simpleName
                Response.text(403, "Forbidden", "Forbidden")
            } catch (error: Exception) {
                failure = error.message ?: error.javaClass.simpleName
                Response.text(500, "Internal Server Error", "Internal Server Error")
            }

            val contentLength = request.headers["content-length"]?.toLongOrNull() ?: 0L
            val keepAlive = request.keepAlive && contentLength == 0L &&
                requestsOnConnection < MAX_REQUESTS_PER_CONNECTION
            val includeBody = request.method != "HEAD"
            try {
                writeResponse(output, response, keepAlive, includeBody)
            } catch (error: IOException) {
                failure = failure ?: error.message ?: error.javaClass.simpleName
            } finally {
                response.close()
                onRequest(
                    RequestLog(
                        method = request.method,
                        path = request.target,
                        status = response.status,
                        durationMillis = (System.nanoTime() - startedAt) / 1_000_000,
                        error = failure
                    )
                )
            }
            if (!keepAlive || failure != null) break
        }
    }

    private fun serve(request: Request): Response {
        if (request.method == "OPTIONS" && config.cors) {
            return addCommonHeaders(Response.empty(204, "No Content"))
        }
        if (request.method != "GET" && request.method != "HEAD") {
            return addCommonHeaders(
                Response.text(405, "Method Not Allowed", "Method Not Allowed").apply {
                    headers["Allow"] = "GET, HEAD, OPTIONS"
                }
            )
        }

        val decoded = decodePath(request.target)
        val metadata = tree.metadata(decoded.segments)
        val response = when {
            metadata?.isDirectory == false -> serveFile(decoded.segments, metadata, request)
            metadata?.isDirectory == true -> serveDirectory(decoded, request)
            else -> serveNotFound(request)
        }
        return addCommonHeaders(response)
    }

    private fun serveDirectory(path: DecodedPath, request: Request): Response {
        val indexPath = path.segments + "index.html"
        val index = tree.metadata(indexPath)
        if (index != null && !index.isDirectory) return serveFile(indexPath, index, request)

        if (config.directoryListing) {
            val entries = tree.list(path.segments)
                ?: return Response.text(404, "Not Found", "Not Found")
            val bounded = entries.take(config.maxDirectoryEntries)
            val truncated = entries.size > bounded.size
            return Response.bytes(
                200,
                "OK",
                "text/html; charset=utf-8",
                renderDirectory(path.urlPath, bounded, truncated).toByteArray(StandardCharsets.UTF_8)
            )
        }
        return serveNotFound(request)
    }

    private fun serveNotFound(request: Request): Response {
        if (config.spa) {
            val indexPath = listOf("index.html")
            val index = tree.metadata(indexPath)
            if (index != null && !index.isDirectory) return serveFile(indexPath, index, request)
        }
        return Response.text(404, "Not Found", "Not Found")
    }

    private fun serveFile(path: List<String>, metadata: TreeEntry, request: Request): Response {
        val etag = "\"${metadata.lastModifiedMillis.toString(16)}-${metadata.size.toString(16)}\""
        val contentType = contentType(metadata)
        val commonFileHeaders = linkedMapOf(
            "Accept-Ranges" to "bytes",
            "Content-Type" to contentType,
            "ETag" to etag,
            "Last-Modified" to formatHttpDate(metadata.lastModifiedMillis)
        )

        if (ifNoneMatch(request.headers["if-none-match"], etag)) {
            return Response.empty(304, "Not Modified").apply { headers.putAll(commonFileHeaders) }
        }

        return when (val range = parseRange(request.headers["range"], metadata.size)) {
            RangeResult.Unsatisfiable -> Response.text(
                416,
                "Range Not Satisfiable",
                "Range Not Satisfiable"
            ).apply {
                headers.putAll(commonFileHeaders)
                headers["Content-Range"] = "bytes */${metadata.size}"
            }

            is RangeResult.Satisfiable -> {
                val length = range.end - range.start + 1
                val body = if (request.method == "HEAD") null else openBody(path, range.start, length)
                    ?: return Response.text(404, "Not Found", "Not Found")
                Response(206, "Partial Content", body).apply {
                    headers.putAll(commonFileHeaders)
                    headers["Content-Length"] = length.toString()
                    headers["Content-Range"] = "bytes ${range.start}-${range.end}/${metadata.size}"
                }
            }

            RangeResult.None -> {
                val body = if (request.method == "HEAD") null else openBody(path, 0, metadata.size)
                    ?: return Response.text(404, "Not Found", "Not Found")
                Response(200, "OK", body).apply {
                    headers.putAll(commonFileHeaders)
                    headers["Content-Length"] = metadata.size.toString()
                }
            }
        }
    }

    private fun openBody(path: List<String>, offset: Long, length: Long): Body? {
        val stream = tree.open(path) ?: return null
        return try {
            skipFully(stream, offset)
            Body(stream, length)
        } catch (error: Exception) {
            runCatching { stream.close() }
            throw error
        }
    }

    private fun addCommonHeaders(response: Response): Response = response.apply {
        headers["Server"] = "ok200"
        if (config.cors) {
            headers["Access-Control-Allow-Origin"] = "*"
            headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
            headers["Access-Control-Allow-Headers"] = "*"
        }
    }

    private fun readRequest(input: InputStream): Request? {
        val bytes = ByteArrayOutputStream()
        var matched = 0
        while (bytes.size() < config.maxHeaderBytes) {
            val value = input.read()
            if (value < 0) {
                if (bytes.size() == 0) return null
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            bytes.write(value)
            matched = when {
                matched == 0 && value == '\r'.code -> 1
                matched == 1 && value == '\n'.code -> 2
                matched == 2 && value == '\r'.code -> 3
                matched == 3 && value == '\n'.code -> 4
                value == '\r'.code -> 1
                else -> 0
            }
            if (matched == 4) break
        }
        if (matched != 4) throw HttpParseException(431, "Request Header Fields Too Large", "Request Header Fields Too Large")

        val text = bytes.toString(StandardCharsets.ISO_8859_1.name())
        val lines = text.removeSuffix("\r\n\r\n").split("\r\n")
        val requestParts = lines.firstOrNull()?.split(' ') ?: emptyList()
        if (requestParts.size != 3) throw HttpParseException(400, "Bad Request", "Bad Request")
        val method = requestParts[0]
        val target = requestParts[1]
        val version = requestParts[2]
        if (!TOKEN.matches(method) || target.isEmpty() || (version != "HTTP/1.0" && version != "HTTP/1.1")) {
            throw HttpParseException(400, "Bad Request", "Bad Request")
        }

        val headers = linkedMapOf<String, String>()
        for (line in lines.drop(1)) {
            if (line.isEmpty() || line.startsWith(' ') || line.startsWith('\t')) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            val colon = line.indexOf(':')
            if (colon <= 0) throw HttpParseException(400, "Bad Request", "Bad Request")
            val name = line.substring(0, colon).trim()
            val value = line.substring(colon + 1).trim()
            if (!TOKEN.matches(name) || value.any { it == '\r' || it == '\n' || it == '\u0000' }) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            headers.merge(name.lowercase(Locale.US), value) { old, next -> "$old,$next" }
        }

        val connection = headers["connection"]?.lowercase(Locale.US)
        val keepAlive = if (version == "HTTP/1.1") connection != "close" else connection == "keep-alive"
        return Request(method, target, version, headers, keepAlive)
    }

    private fun writeResponse(
        output: BufferedOutputStream,
        response: Response,
        keepAlive: Boolean,
        includeBody: Boolean
    ) {
        if (!response.headers.containsKey("Content-Length")) {
            response.headers["Content-Length"] = (response.body?.length ?: 0).toString()
        }
        response.headers["Connection"] = if (keepAlive) "keep-alive" else "close"
        val head = buildString {
            append("HTTP/1.1 ${response.status} ${response.reason}\r\n")
            response.headers.forEach { (name, value) -> append("$name: $value\r\n") }
            append("\r\n")
        }
        output.write(head.toByteArray(StandardCharsets.ISO_8859_1))
        if (includeBody) response.body?.writeTo(output)
        output.flush()
    }

    private fun renderDirectory(urlPath: String, entries: List<TreeEntry>, truncated: Boolean): String {
        val sorted = entries.sortedWith(
            compareByDescending<TreeEntry> { it.isDirectory }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
        )
        val displayPath = escapeHtml(urlPath)
        val base = if (urlPath == "/") "/" else "$urlPath/"
        return buildString(2_048 + sorted.size * 160) {
            append("<!doctype html><html><head><meta charset=\"utf-8\">")
            append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            append("<meta name=\"color-scheme\" content=\"light dark\">")
            append("<title>Index of $displayPath — 200 OK Web Server</title>")
            append(DIRECTORY_STYLE)
            append("</head><body><main><div class=\"brand\"><b>200</b> 200 OK Web Server</div>")
            append("<h1>Index of <code>$displayPath</code></h1><table>")
            append("<thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead><tbody>")
            if (urlPath != "/") append("<tr><td><a href=\"../\">↥ Parent directory</a></td><td>—</td><td>—</td></tr>")
            for (entry in sorted) {
                val suffix = if (entry.isDirectory) "/" else ""
                val href = escapeHtml(base + percentEncode(entry.name) + suffix)
                val name = escapeHtml(entry.name) + suffix
                val icon = if (entry.isDirectory) "📁" else "📄"
                val size = if (entry.isDirectory) "—" else formatSize(entry.size)
                val modified = if (entry.lastModifiedMillis > 0) formatHttpDate(entry.lastModifiedMillis) else "—"
                append("<tr><td><a href=\"$href\">$icon $name</a></td><td>$size</td><td>$modified</td></tr>")
            }
            if (sorted.isEmpty()) append("<tr><td colspan=\"3\">This folder is empty</td></tr>")
            if (truncated) append("<tr><td colspan=\"3\">Listing truncated at ${config.maxDirectoryEntries} entries</td></tr>")
            append("</tbody></table></main></body></html>")
        }
    }

    private data class Request(
        val method: String,
        val target: String,
        val version: String,
        val headers: Map<String, String>,
        val keepAlive: Boolean
    )

    private data class DecodedPath(val segments: List<String>, val urlPath: String)

    private class Body(val stream: InputStream, val length: Long) : Closeable {
        fun writeTo(output: OutputStream) {
            var remaining = length
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (remaining > 0) {
                val read = stream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (read < 0) throw EOFException("File ended before advertised length")
                if (read == 0) continue
                output.write(buffer, 0, read)
                remaining -= read
            }
        }

        override fun close() = stream.close()
    }

    private class Response(
        val status: Int,
        val reason: String,
        val body: Body? = null,
        val headers: LinkedHashMap<String, String> = linkedMapOf()
    ) : Closeable {
        override fun close() {
            runCatching { body?.close() }
        }

        companion object {
            fun empty(status: Int, reason: String) = Response(status, reason)

            fun text(status: Int, reason: String, value: String): Response =
                bytes(status, reason, "text/plain; charset=utf-8", value.toByteArray(StandardCharsets.UTF_8))

            fun bytes(status: Int, reason: String, contentType: String, value: ByteArray): Response =
                Response(status, reason, Body(ByteArrayInputStream(value), value.size.toLong())).apply {
                    headers["Content-Type"] = contentType
                    headers["Content-Length"] = value.size.toString()
                }
        }
    }

    private class HttpParseException(
        val status: Int,
        val reason: String,
        val publicMessage: String
    ) : IOException(publicMessage)

    private sealed interface RangeResult {
        data object None : RangeResult
        data object Unsatisfiable : RangeResult
        data class Satisfiable(val start: Long, val end: Long) : RangeResult
    }

    companion object {
        private const val MAX_REQUESTS_PER_CONNECTION = 100
        private val TOKEN = Regex("[!#$%&'*+.^_`|~0-9A-Za-z-]+")
        private val HTTP_DATE: DateTimeFormatter = DateTimeFormatter.RFC_1123_DATE_TIME
            .withLocale(Locale.US)
            .withZone(ZoneOffset.UTC)
        private val TEXT_TYPES = setOf(
            "application/javascript",
            "application/json",
            "application/manifest+json",
            "application/xml",
            "image/svg+xml"
        )
        private val DIRECTORY_STYLE = """
            <style>
            :root{color-scheme:light dark;font:14px system-ui,sans-serif}body{margin:0;padding:24px;background:#fff;color:#171717}
            main{max-width:920px;margin:auto}.brand{color:#686868}.brand b{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#f8d203;color:#171717;font-size:9px}
            h1{font-size:22px}table{width:100%;border-collapse:collapse;border:1px solid #d7d7d2}th,td{padding:9px 12px;border-bottom:1px solid #d7d7d2;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
            @media(prefers-color-scheme:dark){body{background:#0d0d0d;color:#fff}table,th,td{border-color:#333}.brand{color:#aaa}}
            @media(max-width:620px){body{padding:14px 10px}th:last-child,td:last-child{display:none}}
            </style>
        """.trimIndent()

        private fun decodePath(target: String): DecodedPath {
            val rawPath = target.substringBefore('?')
            if (!rawPath.startsWith('/') || rawPath.startsWith("//")) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            val decoded = percentDecode(rawPath)
            if (decoded.indexOf('\u0000') >= 0 || decoded.indexOf('\\') >= 0 || decoded.indexOf(':') >= 0) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            val segments = decoded.split('/').filter(String::isNotEmpty)
            if (segments.any { it == "." || it == ".." }) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
            val urlPath = if (segments.isEmpty()) "/" else "/" + segments.joinToString("/") { percentEncode(it) }
            return DecodedPath(segments, urlPath)
        }

        private fun percentDecode(value: String): String {
            val bytes = ByteArrayOutputStream(value.length)
            var index = 0
            while (index < value.length) {
                val char = value[index]
                if (char == '%') {
                    if (index + 2 >= value.length) throw HttpParseException(400, "Bad Request", "Bad Request")
                    val high = value[index + 1].digitToIntOrNull(16)
                    val low = value[index + 2].digitToIntOrNull(16)
                    if (high == null || low == null) throw HttpParseException(400, "Bad Request", "Bad Request")
                    bytes.write((high shl 4) or low)
                    index += 3
                } else {
                    val codePoint = Character.codePointAt(value, index)
                    bytes.write(String(Character.toChars(codePoint)).toByteArray(StandardCharsets.UTF_8))
                    index += Character.charCount(codePoint)
                }
            }
            return try {
                StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes.toByteArray()))
                    .toString()
            } catch (_: Exception) {
                throw HttpParseException(400, "Bad Request", "Bad Request")
            }
        }

        private fun parseRange(value: String?, size: Long): RangeResult {
            if (value == null) return RangeResult.None
            val trimmed = value.trim()
            if (!trimmed.startsWith("bytes=", ignoreCase = true)) return RangeResult.None
            val spec = trimmed.substringAfter('=').trim()
            if (spec.isEmpty() || spec.contains(',')) return RangeResult.Unsatisfiable
            val parts = spec.split('-', limit = 2)
            if (parts.size != 2) return RangeResult.Unsatisfiable
            val startRaw = parts[0].trim()
            val endRaw = parts[1].trim()
            if (startRaw.isEmpty()) {
                val suffix = endRaw.toLongOrNull() ?: return RangeResult.Unsatisfiable
                if (suffix <= 0 || size <= 0) return RangeResult.Unsatisfiable
                return RangeResult.Satisfiable((size - suffix).coerceAtLeast(0), size - 1)
            }
            val start = startRaw.toLongOrNull() ?: return RangeResult.Unsatisfiable
            if (start < 0 || start >= size) return RangeResult.Unsatisfiable
            if (endRaw.isEmpty()) return RangeResult.Satisfiable(start, size - 1)
            val end = endRaw.toLongOrNull() ?: return RangeResult.Unsatisfiable
            if (end < start) return RangeResult.Unsatisfiable
            return RangeResult.Satisfiable(start, minOf(end, size - 1))
        }

        private fun ifNoneMatch(value: String?, etag: String): Boolean =
            value?.split(',')?.map(String::trim)?.any { it == "*" || it == etag } == true

        private fun contentType(entry: TreeEntry): String {
            val guessed = entry.mimeType ?: URLConnection.guessContentTypeFromName(entry.name)
                ?: MIME_OVERRIDES[entry.name.substringAfterLast('.', "").lowercase(Locale.US)]
                ?: "application/octet-stream"
            return if (guessed.startsWith("text/") || guessed in TEXT_TYPES) "$guessed; charset=utf-8" else guessed
        }

        private val MIME_OVERRIDES = mapOf(
            "css" to "text/css",
            "html" to "text/html",
            "js" to "application/javascript",
            "json" to "application/json",
            "mjs" to "application/javascript",
            "svg" to "image/svg+xml",
            "wasm" to "application/wasm",
            "webmanifest" to "application/manifest+json"
        )

        private fun formatHttpDate(millis: Long): String = HTTP_DATE.format(Instant.ofEpochMilli(millis.coerceAtLeast(0)))

        private fun percentEncode(value: String): String = buildString {
            for (byte in value.toByteArray(StandardCharsets.UTF_8)) {
                val unsigned = byte.toInt() and 0xff
                if (unsigned in 'a'.code..'z'.code || unsigned in 'A'.code..'Z'.code ||
                    unsigned in '0'.code..'9'.code || unsigned == '-'.code || unsigned == '_'.code ||
                    unsigned == '.'.code || unsigned == '~'.code
                ) {
                    append(unsigned.toChar())
                } else {
                    append('%')
                    append(HEX[unsigned ushr 4])
                    append(HEX[unsigned and 0x0f])
                }
            }
        }

        private fun escapeHtml(value: String): String = buildString(value.length) {
            value.forEach { char ->
                append(
                    when (char) {
                        '&' -> "&amp;"
                        '<' -> "&lt;"
                        '>' -> "&gt;"
                        '"' -> "&quot;"
                        '\'' -> "&#39;"
                        else -> char
                    }
                )
            }
        }

        private fun formatSize(bytes: Long): String {
            if (bytes < 1024) return "$bytes B"
            val units = arrayOf("KB", "MB", "GB", "TB")
            var value = bytes.toDouble()
            var unit = -1
            while (value >= 1024 && unit < units.lastIndex) {
                value /= 1024
                unit++
            }
            return String.format(Locale.US, "%.1f %s", value, units[unit])
        }

        private fun skipFully(stream: InputStream, count: Long) {
            var remaining = count
            while (remaining > 0) {
                val skipped = stream.skip(remaining)
                if (skipped > 0) {
                    remaining -= skipped
                } else if (stream.read() >= 0) {
                    remaining--
                } else {
                    throw EOFException("Unable to seek to requested range")
                }
            }
        }

        private const val HEX = "0123456789ABCDEF"
    }
}
