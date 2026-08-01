package app.ok200.android.power

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Lightweight battery, screen, power-save, and Doze observability. */
class DozeMonitor(context: Context) {
    sealed class PowerState(val name: String) {
        data object Active : PowerState("ACTIVE")
        data object ScreenOff : PowerState("SCREEN_OFF")
        data object Dozing : PowerState("DOZING")
        data object Charging : PowerState("CHARGING")
        data object ChargingButDozing : PowerState("CHARGING_BUT_DOZING")
    }

    private val appContext = context.applicationContext
    private val powerManager = appContext.getSystemService(PowerManager::class.java)
    private val _isCharging = MutableStateFlow(readBattery().first)
    val isCharging: StateFlow<Boolean> = _isCharging.asStateFlow()
    private val _batteryLevel = MutableStateFlow(readBattery().second)
    val batteryLevel: StateFlow<Int> = _batteryLevel.asStateFlow()
    private val _isDozing = MutableStateFlow(powerManager.isDeviceIdleMode)
    val isDozing: StateFlow<Boolean> = _isDozing.asStateFlow()
    private val _isScreenOn = MutableStateFlow(powerManager.isInteractive)
    val isScreenOn: StateFlow<Boolean> = _isScreenOn.asStateFlow()
    private val _isPowerSave = MutableStateFlow(powerManager.isPowerSaveMode)
    val isPowerSave: StateFlow<Boolean> = _isPowerSave.asStateFlow()
    private val _powerState = MutableStateFlow(currentPowerState())
    val powerState: StateFlow<PowerState> = _powerState.asStateFlow()

    private var receiver: BroadcastReceiver? = null

    fun start() {
        if (receiver != null) return
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_SCREEN_ON -> _isScreenOn.value = true
                    Intent.ACTION_SCREEN_OFF -> _isScreenOn.value = false
                    Intent.ACTION_BATTERY_CHANGED,
                    Intent.ACTION_POWER_CONNECTED,
                    Intent.ACTION_POWER_DISCONNECTED -> {
                        val (charging, level) = batteryFromIntent(intent) ?: readBattery()
                        _isCharging.value = charging
                        _batteryLevel.value = level
                    }
                    PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED ->
                        _isDozing.value = powerManager.isDeviceIdleMode
                    PowerManager.ACTION_POWER_SAVE_MODE_CHANGED ->
                        _isPowerSave.value = powerManager.isPowerSaveMode
                }
                val previous = _powerState.value
                _powerState.value = currentPowerState()
                if (previous != _powerState.value) {
                    Log.i(TAG, "Power state: ${previous.name} -> ${_powerState.value.name}")
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            appContext.registerReceiver(receiver, filter)
        }
        refresh()
        Log.i(TAG, "Power monitor started: ${getDebugSummary().lineSequence().first()}")
    }

    fun stop() {
        receiver?.let { runCatching { appContext.unregisterReceiver(it) } }
        receiver = null
    }

    fun refresh() {
        val (charging, level) = readBattery()
        _isCharging.value = charging
        _batteryLevel.value = level
        _isDozing.value = powerManager.isDeviceIdleMode
        _isScreenOn.value = powerManager.isInteractive
        _isPowerSave.value = powerManager.isPowerSaveMode
        _powerState.value = currentPowerState()
    }

    fun isIgnoringBatteryOptimizations(): Boolean =
        powerManager.isIgnoringBatteryOptimizations(appContext.packageName)

    fun getDebugSummary(): String = buildString {
        appendLine("Power State: ${_powerState.value.name}")
        appendLine("Screen on: ${_isScreenOn.value}")
        appendLine("Charging: ${_isCharging.value}")
        appendLine("Battery level: ${_batteryLevel.value}%")
        appendLine("Dozing: ${_isDozing.value}")
        appendLine("Power save: ${_isPowerSave.value}")
        appendLine("Battery optimization ignored: ${isIgnoringBatteryOptimizations()}")
    }

    private fun currentPowerState(): PowerState = when {
        _isCharging.value && _isDozing.value -> PowerState.ChargingButDozing
        _isCharging.value -> PowerState.Charging
        _isDozing.value -> PowerState.Dozing
        !_isScreenOn.value -> PowerState.ScreenOff
        else -> PowerState.Active
    }

    private fun readBattery(): Pair<Boolean, Int> {
        val intent = appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return false to -1
        return batteryFromIntent(intent) ?: (false to -1)
    }

    private fun batteryFromIntent(intent: Intent): Pair<Boolean, Int>? {
        if (intent.action != Intent.ACTION_BATTERY_CHANGED) return null
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        return charging to if (scale > 0) (level * 100) / scale else level
    }

    private companion object {
        const val TAG = "DozeMonitor"
    }
}
