package app.ok200.android.server

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.ContextCompat
import app.ok200.android.power.DozeMonitor
import app.ok200.android.power.WakeLockManager
import app.ok200.android.server.storage.FilesystemFileTree
import app.ok200.android.server.storage.ReadOnlyFileTree
import app.ok200.android.server.storage.SafFileTree
import app.ok200.android.service.WebServerService
import app.ok200.android.settings.SettingsStore
import app.ok200.android.settings.WakeLockMode
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val TAG = "AndroidServerController"

enum class ServerPhase {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
    FAILED
}

data class ServerState(
    val phase: ServerPhase = ServerPhase.STOPPED,
    val running: Boolean = false,
    val port: Int = 0,
    val configuredPort: Int = 8080,
    val host: String = "",
    val rootUri: String? = null,
    val error: String? = null
)

/** Single owner for the Android server and all resources tied to a running server. */
class AndroidServerController(
    context: Context,
    private val settings: SettingsStore,
    private val powerMonitor: DozeMonitor
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val commandMutex = Mutex()
    private val wakeLocks = WakeLockManager(appContext)
    private val _state = MutableStateFlow(
        ServerState(configuredPort = settings.port, rootUri = settings.rootUri)
    )
    val state: StateFlow<ServerState> = _state.asStateFlow()

    private var server: KotlinHttpServer? = null
    private var batteryJob: Job? = null

    /** Entry point for UI/RPC. Background runs are initialized by the service. */
    fun requestStart() {
        if (settings.backgroundEnabled) {
            settings.desiredRunning = true
            val intent = WebServerService.startIntent(appContext)
            ContextCompat.startForegroundService(appContext, intent)
        } else {
            settings.desiredRunning = false
            scope.launch { startNow(backgroundRun = false) }
        }
    }

    /** Called by the foreground service after it has posted its notification. */
    fun requestStartFromService() {
        settings.desiredRunning = true
        scope.launch { startNow(backgroundRun = true) }
    }

    fun requestStop() {
        settings.desiredRunning = false
        scope.launch { stopNow() }
    }

    suspend fun startNow(backgroundRun: Boolean): ServerState = commandMutex.withLock {
        val current = _state.value
        if (current.running) {
            if (backgroundRun) settings.desiredRunning = true
            return current
        }
        if (current.phase == ServerPhase.STARTING) return current

        val rootValue = settings.rootUri
        if (rootValue.isNullOrBlank()) return failStart("No folder selected")
        val rootUri = runCatching { Uri.parse(rootValue) }.getOrNull()
            ?: return failStart("Selected folder is invalid")

        _state.value = ServerState(
            phase = ServerPhase.STARTING,
            configuredPort = settings.port,
            host = bindHost(),
            rootUri = rootValue
        )

        try {
            val tree = createTree(rootUri)
            val httpServer = KotlinHttpServer(
                tree = tree,
                config = HttpServerConfig(
                    host = bindHost(),
                    port = settings.port,
                    cors = settings.corsEnabled,
                    spa = settings.spaEnabled,
                    directoryListing = settings.directoryListing
                ),
                onRequest = { request ->
                    val suffix = request.error?.let { " error=$it" }.orEmpty()
                    Log.i(TAG, "${request.method} ${request.path} ${request.status} ${request.durationMillis}ms$suffix")
                }
            )
            val info = httpServer.start()
            server = httpServer
            wakeLocks.acquire(settings.wakeLockMode)
            startBatteryMonitoring()
            _state.value = ServerState(
                phase = ServerPhase.RUNNING,
                running = true,
                port = info.port,
                configuredPort = info.configuredPort,
                host = info.host,
                rootUri = rootValue
            )
            Log.i(TAG, "Server running on ${info.host}:${info.port}")
            return _state.value
        } catch (error: Exception) {
            Log.e(TAG, "Failed to start server", error)
            return failStart(error.message ?: "Unable to start server")
        }
    }

    suspend fun stopNow(): ServerState = commandMutex.withLock {
        val current = _state.value
        if (!current.running && current.phase != ServerPhase.STARTING && current.phase != ServerPhase.FAILED) {
            stopForegroundService()
            return current
        }

        _state.value = current.copy(phase = ServerPhase.STOPPING, running = false, error = null)
        batteryJob?.cancel()
        batteryJob = null
        runCatching { server?.stop() }
            .onFailure { Log.w(TAG, "Server stop failed", it) }
        server = null
        wakeLocks.release()
        _state.value = ServerState(
            phase = ServerPhase.STOPPED,
            configuredPort = settings.port,
            rootUri = settings.rootUri
        )
        stopForegroundService()
        Log.i(TAG, "Server stopped")
        return _state.value
    }

    fun onAppBackgrounded() {
        if (!settings.backgroundEnabled && _state.value.running) requestStop()
    }

    fun onBackgroundSettingChanged(enabled: Boolean) {
        settings.backgroundEnabled = enabled
        if (!enabled) {
            settings.desiredRunning = false
            if (settings.startOnBoot) settings.startOnBoot = false
            stopForegroundService()
        } else if (_state.value.running) {
            settings.desiredRunning = true
            ContextCompat.startForegroundService(appContext, WebServerService.startIntent(appContext))
        }
    }

    fun updateWakeLockMode(mode: WakeLockMode) {
        settings.wakeLockMode = mode
        if (_state.value.running) wakeLocks.updateMode(mode)
    }

    fun onPowerSettingsChanged() {
        if (_state.value.running) startBatteryMonitoring()
    }

    fun shutdown() {
        settings.desiredRunning = false
        runCatching { server?.stop() }
        server = null
        batteryJob?.cancel()
        wakeLocks.release()
        powerMonitor.stop()
        scope.cancel()
    }

    private fun failStart(message: String): ServerState {
        settings.desiredRunning = false
        batteryJob?.cancel()
        batteryJob = null
        runCatching { server?.stop() }
        server = null
        wakeLocks.release()
        _state.value = ServerState(
            phase = ServerPhase.FAILED,
            configuredPort = settings.port,
            rootUri = settings.rootUri,
            error = message
        )
        stopForegroundService()
        return _state.value
    }

    private fun createTree(uri: Uri): ReadOnlyFileTree = when (uri.scheme?.lowercase()) {
        "file" -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
                error("All files access is required for a filesystem root")
            }
            val path = uri.path ?: error("Filesystem root has no path")
            val root = File(path).canonicalFile
            require(root.path != File.separator) { "The Android OS root cannot be served" }
            FilesystemFileTree(root)
        }
        "content" -> SafFileTree(appContext, uri)
        else -> error("Unsupported folder URI")
    }

    private fun bindHost(): String = if (settings.lanEnabled) "0.0.0.0" else "127.0.0.1"

    private fun startBatteryMonitoring() {
        batteryJob?.cancel()
        batteryJob = null
        if (!settings.shutdownOnLowBattery) return
        batteryJob = scope.launch {
            combine(powerMonitor.batteryLevel, powerMonitor.isCharging) { level, charging -> level to charging }
                .collect { (level, charging) ->
                    if (settings.shutdownOnLowBattery && !charging &&
                        level in 1..settings.shutdownBatteryThreshold && _state.value.running
                    ) {
                        Log.w(TAG, "Battery low ($level%) — stopping server")
                        settings.desiredRunning = false
                        // This collector cannot wait for itself to be cancelled under stopNow.
                        scope.launch { stopNow() }
                    }
                }
        }
    }

    private fun stopForegroundService() {
        appContext.stopService(Intent(appContext, WebServerService::class.java))
    }
}
