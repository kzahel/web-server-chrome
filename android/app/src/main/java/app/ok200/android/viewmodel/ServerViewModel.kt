package app.ok200.android.viewmodel

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import app.ok200.android.Ok200Application
import app.ok200.android.settings.WakeLockMode
import java.net.Inet4Address
import java.net.NetworkInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ServerViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as Ok200Application
    private val settings = app.settingsStore
    private val controller = app.serverController

    private val _port = MutableStateFlow(settings.port)
    val port: StateFlow<Int> = _port.asStateFlow()

    private val _rootUri = MutableStateFlow(settings.rootUri?.let(Uri::parse))
    val rootUri: StateFlow<Uri?> = _rootUri.asStateFlow()

    private val _rootDisplayName = MutableStateFlow(settings.rootDisplayName.orEmpty())
    val rootDisplayName: StateFlow<String> = _rootDisplayName.asStateFlow()

    private val _allFilesAccess = MutableStateFlow(hasAllFilesAccess())
    val allFilesAccess: StateFlow<Boolean> = _allFilesAccess.asStateFlow()

    private val _lanEnabled = MutableStateFlow(settings.lanEnabled)
    val lanEnabled: StateFlow<Boolean> = _lanEnabled.asStateFlow()

    private val _directoryListing = MutableStateFlow(settings.directoryListing)
    val directoryListing: StateFlow<Boolean> = _directoryListing.asStateFlow()

    private val _corsEnabled = MutableStateFlow(settings.corsEnabled)
    val corsEnabled: StateFlow<Boolean> = _corsEnabled.asStateFlow()

    private val _spaEnabled = MutableStateFlow(settings.spaEnabled)
    val spaEnabled: StateFlow<Boolean> = _spaEnabled.asStateFlow()

    val serverState = controller.state

    private val _localIpAddress = MutableStateFlow(findLocalIp())
    val localIpAddress: StateFlow<String> = _localIpAddress.asStateFlow()

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

    val powerState = app.dozeMonitor.powerState
    val batteryLevel = app.dozeMonitor.batteryLevel
    val isCharging = app.dozeMonitor.isCharging
    val isDozing = app.dozeMonitor.isDozing

    private val _notificationPermissionGranted = MutableStateFlow(checkNotificationPermission())
    val notificationPermissionGranted: StateFlow<Boolean> = _notificationPermissionGranted.asStateFlow()

    fun setPort(port: Int) {
        if (port !in 0..65_535) return
        _port.value = port
        settings.port = port
    }

    fun setRootUri(uri: Uri, displayName: String) {
        _rootUri.value = uri
        _rootDisplayName.value = displayName
        settings.rootUri = uri.toString()
        settings.rootDisplayName = displayName
    }

    fun refreshAllFilesAccess() {
        _allFilesAccess.value = hasAllFilesAccess()
        settings.allFilesAccess = _allFilesAccess.value
    }

    fun setAllFilesAccess(@Suppress("UNUSED_PARAMETER") enabled: Boolean) = refreshAllFilesAccess()

    fun setLanEnabled(enabled: Boolean) {
        _lanEnabled.value = enabled
        settings.lanEnabled = enabled
    }

    fun setDirectoryListing(enabled: Boolean) {
        _directoryListing.value = enabled
        settings.directoryListing = enabled
    }

    fun setCorsEnabled(enabled: Boolean) {
        _corsEnabled.value = enabled
        settings.corsEnabled = enabled
    }

    fun setSpaEnabled(enabled: Boolean) {
        _spaEnabled.value = enabled
        settings.spaEnabled = enabled
    }

    fun setBackgroundEnabled(enabled: Boolean) {
        _backgroundEnabled.value = enabled
        controller.onBackgroundSettingChanged(enabled)
        if (!enabled && _startOnBoot.value) _startOnBoot.value = false
    }

    fun setWakeLockMode(mode: WakeLockMode) {
        _wakeLockMode.value = mode
        controller.updateWakeLockMode(mode)
    }

    fun setStartOnBoot(enabled: Boolean) {
        _startOnBoot.value = enabled
        settings.startOnBoot = enabled
        if (enabled && !_backgroundEnabled.value) {
            _backgroundEnabled.value = true
            controller.onBackgroundSettingChanged(true)
        }
    }

    fun setShutdownOnLowBattery(enabled: Boolean) {
        _shutdownOnLowBattery.value = enabled
        settings.shutdownOnLowBattery = enabled
        controller.onPowerSettingsChanged()
    }

    fun setShutdownBatteryThreshold(threshold: Int) {
        val bounded = threshold.coerceIn(5, 50)
        _shutdownBatteryThreshold.value = bounded
        settings.shutdownBatteryThreshold = bounded
        controller.onPowerSettingsChanged()
    }

    fun startServer() = controller.requestStart()

    fun stopServer() = controller.requestStop()

    fun updateNotificationPermission(granted: Boolean) {
        _notificationPermissionGranted.value = granted
    }

    fun refreshSystemState() {
        refreshAllFilesAccess()
        refreshNotificationPermission()
        _localIpAddress.value = findLocalIp()
    }

    fun refreshNotificationPermission() {
        _notificationPermissionGranted.value = checkNotificationPermission()
    }

    fun isIgnoringBatteryOptimizations(): Boolean = app.dozeMonitor.isIgnoringBatteryOptimizations()

    private fun checkNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasAllFilesAccess(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()

    private fun findLocalIp(): String = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .asSequence()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList().asSequence() }
            .filterIsInstance<Inet4Address>()
            .firstOrNull { !it.isLoopbackAddress }
            ?.hostAddress
            ?: "127.0.0.1"
    }.getOrDefault("127.0.0.1")
}
