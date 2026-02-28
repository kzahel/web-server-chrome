package app.ok200.android.viewmodel

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.ok200.android.Ok200Application
import app.ok200.android.service.WebServerService
import app.ok200.quickjs.ServerState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val TAG = "ServerViewModel"
private const val PREFS_NAME = "ok200_prefs"
private const val KEY_PORT = "port"
private const val KEY_ROOT_URI = "root_uri"
private const val KEY_ROOT_DISPLAY = "root_display"
private const val KEY_ALL_FILES_ACCESS = "all_files_access"

class ServerViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as Ok200Application
    private val prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _port = MutableStateFlow(prefs.getInt(KEY_PORT, 8080))
    val port: StateFlow<Int> = _port.asStateFlow()

    private val _rootUri = MutableStateFlow<Uri?>(
        prefs.getString(KEY_ROOT_URI, null)?.let { Uri.parse(it) }
    )
    val rootUri: StateFlow<Uri?> = _rootUri.asStateFlow()

    private val _rootDisplayName = MutableStateFlow(
        prefs.getString(KEY_ROOT_DISPLAY, null) ?: ""
    )
    val rootDisplayName: StateFlow<String> = _rootDisplayName.asStateFlow()

    private val _allFilesAccess = MutableStateFlow(prefs.getBoolean(KEY_ALL_FILES_ACCESS, false))
    val allFilesAccess: StateFlow<Boolean> = _allFilesAccess.asStateFlow()

    private val _serverState = MutableStateFlow(ServerState())
    val serverState: StateFlow<ServerState> = _serverState.asStateFlow()

    private val _localIpAddress = MutableStateFlow("")
    val localIpAddress: StateFlow<String> = _localIpAddress.asStateFlow()

    init {
        refreshLocalIp()
    }

    fun setPort(port: Int) {
        _port.value = port
        prefs.edit().putInt(KEY_PORT, port).apply()
    }

    fun setAllFilesAccess(enabled: Boolean) {
        _allFilesAccess.value = enabled
        prefs.edit().putBoolean(KEY_ALL_FILES_ACCESS, enabled).apply()
    }

    fun setRootUri(uri: Uri, displayName: String) {
        _rootUri.value = uri
        _rootDisplayName.value = displayName
        app.servingRootUri = uri
        prefs.edit()
            .putString(KEY_ROOT_URI, uri.toString())
            .putString(KEY_ROOT_DISPLAY, displayName)
            .apply()
    }

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

                // Observe state updates
                launch {
                    controller.state.collect { state ->
                        _serverState.value = state
                    }
                }

                controller.startServer(_port.value, "0.0.0.0")

                // Start foreground service
                val intent = Intent(app, WebServerService::class.java)
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

                // Stop foreground service
                val intent = Intent(app, WebServerService::class.java)
                app.stopService(intent)
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
