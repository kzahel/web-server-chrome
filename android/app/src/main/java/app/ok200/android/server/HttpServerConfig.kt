package app.ok200.android.server

data class HttpServerConfig(
    val host: String = "127.0.0.1",
    val port: Int = 8080,
    val cors: Boolean = false,
    val spa: Boolean = false,
    val directoryListing: Boolean = true,
    val requestTimeoutMillis: Int = 5_000,
    val maxHeaderBytes: Int = 8 * 1024,
    val maxDirectoryEntries: Int = 10_000,
    val maxConnections: Int = 32
) {
    init {
        require(port in 0..65_535) { "Port must be between 0 and 65535" }
        require(host == "127.0.0.1" || host == "0.0.0.0") { "Unsupported bind host" }
        require(requestTimeoutMillis > 0) { "Request timeout must be positive" }
        require(maxHeaderBytes in 1_024..65_536) { "Header limit must be 1-64 KiB" }
        require(maxDirectoryEntries in 1..10_000) { "Directory limit must be 1-10000" }
        require(maxConnections in 1..256) { "Connection limit must be 1-256" }
    }
}

data class HttpServerInfo(
    val host: String,
    val configuredPort: Int,
    val port: Int
)

data class RequestLog(
    val method: String,
    val path: String,
    val status: Int,
    val durationMillis: Long,
    val error: String? = null
)
