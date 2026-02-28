package app.ok200.android.viewmodel

import android.app.Application
import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.ok200.android.Ok200Application
import app.ok200.android.service.WebServerService
import app.ok200.android.settings.WakeLockMode
import app.ok200.quickjs.ServerState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val TAG = "ServerViewModel"

class ServerViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as Ok200Application
    private val settings = app.settingsStore

    // --- Server settings ---

    private val _port = MutableStateFlow(settings.port)
    val port: StateFlow<Int> = _port.asStateFlow()

    private val _rootUri = MutableStateFlow<Uri?>(
        settings.rootUri?.let { Uri.parse(it) }
    )
    val rootUri: StateFlow<Uri?> = _rootUri.asStateFlow()

    private val _rootDisplayName = MutableStateFlow(settings.rootDisplayName ?: "")
    val rootDisplayName: StateFlow<String> = _rootDisplayName.asStateFlow()

    private val _allFilesAccess = MutableStateFlow(settings.allFilesAccess)
    val allFilesAccess: StateFlow<Boolean> = _allFilesAccess.asStateFlow()

    private val _serverState = MutableStateFlow(ServerState())
    val serverState: StateFlow<ServerState> = _serverState.asStateFlow()

    private val _localIpAddress = MutableStateFlow("")
    val localIpAddress: StateFlow<String> = _localIpAddress.asStateFlow()

    // --- Power settings ---

    private val _backgroundEnabled = MutableStateFlow(settings.backgroundEnabled)
    val backgroundEnabled: StateFlow<Boolean> = _backgroundEnabled.asStateFlow()

    private val _wakeLockMode = MutableStateFlow(settings.wakeLockMode)
    val wakeLockMode: StateFlow<WakeLockMode> = _wakeLockMode.asStateFlow()

    private val _startOnBoot = MutableStateFlow(settings.startOnBoot)
    val startOnBoot: StateFlow<Boolean> = _startOnBoot.asStateFlow()

    private val _shutdownOnLowBattery = MutableStateFlow(settings.shutdownOnLowBattery)
    val shutdownOnLowBattery: StateFlow<Boolean> = _shutdownOnLowBattery.asStateFlow()

    private val _shutdownBatteryThreshold = MutableStateFlow(settings.shutdownBatteryThreshold)
    val shutdownBatteryThreshold: StateFlow<Int> = _shutdownBatteryThreshold.asStateFlow()

    init {
        refreshLocalIp()
    }

    // --- Server setting setters ---

    fun setPort(port: Int) {
        _port.value = port
        settings.port = port
    }

    fun setAllFilesAccess(enabled: Boolean) {
        _allFilesAccess.value = enabled
        settings.allFilesAccess = enabled
    }

    fun setRootUri(uri: Uri, displayName: String) {
        _rootUri.value = uri
        _rootDisplayName.value = displayName
        app.servingRootUri = uri
        settings.rootUri = uri.toString()
        settings.rootDisplayName = displayName
    }

    // --- Power setting setters ---

    fun setBackgroundEnabled(enabled: Boolean) {
        _backgroundEnabled.value = enabled
        settings.backgroundEnabled = enabled
    }

    fun setWakeLockMode(mode: WakeLockMode) {
        _wakeLockMode.value = mode
        settings.wakeLockMode = mode
        // Update running service immediately
        WebServerService.instance?.updateWakeLockMode(mode)
    }

    fun setStartOnBoot(enabled: Boolean) {
        _startOnBoot.value = enabled
        settings.startOnBoot = enabled
    }

    fun setShutdownOnLowBattery(enabled: Boolean) {
        _shutdownOnLowBattery.value = enabled
        settings.shutdownOnLowBattery = enabled
    }

    fun setShutdownBatteryThreshold(threshold: Int) {
        _shutdownBatteryThreshold.value = threshold
        settings.shutdownBatteryThreshold = threshold
    }

    // --- Server control ---

    fun startServer() {
        val uri = _rootUri.value
        if (uri == null) {
            _serverState.value = ServerState(error = "No folder selected")
            return
        }

        app.servingRootUri = uri

        viewModelScope.launch(Dispatchers.IO) {
            try {
                val controller = app.initializeEngine()

                // Observe state updates and forward to lifecycle manager
                launch {
                    controller.state.collect { state ->
                        _serverState.value = state
                        app.serviceLifecycleManager.onServerStateChanged(state.running)
                    }
                }

                controller.startServer(_port.value, "0.0.0.0")

                // Start foreground service directly (lifecycle manager handles background transitions)
                val intent = android.content.Intent(app, WebServerService::class.java)
                app.startForegroundService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start server", e)
                _serverState.value = ServerState(error = e.message)
            }
        }
    }

    fun stopServer() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                app.engineController?.stopServer()
                // Service stop is handled by ServiceLifecycleManager reacting to running=false
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop server", e)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun refreshLocalIp() {
        try {
            val wifiManager = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ipInt = wifiManager.connectionInfo.ipAddress
            if (ipInt != 0) {
                val ip = String.format(
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
                _localIpAddress.value = ip
            } else {
                _localIpAddress.value = "127.0.0.1"
            }
        } catch (e: Exception) {
            _localIpAddress.value = "127.0.0.1"
        }
    }

    override fun onCleared() {
        super.onCleared()
        // Don't stop the server when ViewModel is cleared — service keeps it alive
    }
}
