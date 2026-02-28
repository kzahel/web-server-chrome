package app.ok200.android.power

import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Monitors device power states for observability and debugging.
 *
 * Key insights from Android docs:
 * - ACTION_DEVICE_IDLE_MODE_CHANGED fires AFTER network is already suspended
 * - Light Doze: ~5 minutes after screen off (network blocked, timers still work)
 * - Deep Doze: ~30+ minutes after screen off AND device stationary (everything deferred)
 * - Doze should NOT engage while charging (but anomalies happen)
 *
 * All state is exposed as StateFlow for reactive observation.
 *
 * Logs are tagged with "DozeMonitor" for easy filtering:
 *   adb logcat -s DozeMonitor
 */
class DozeMonitor(private val context: Context) {

    companion object {
        private const val TAG = "DozeMonitor"
    }

    sealed class PowerState(val name: String) {
        /** Screen on, device active — full network access */
        object Active : PowerState("ACTIVE")

        /** Screen off but not yet in Doze — network still works but may soon be suspended */
        object ScreenOff : PowerState("SCREEN_OFF")

        /** In Doze mode (light or deep) — network is suspended */
        object Dozing : PowerState("DOZING")

        /** Charging — Doze shouldn't engage according to Android docs */
        object Charging : PowerState("CHARGING")

        /** Charging but also in Doze (shouldn't happen, but we want to detect it) */
        object ChargingButDozing : PowerState("CHARGING_BUT_DOZING")

        override fun toString(): String = name
    }

    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    private val _powerState = MutableStateFlow(getCurrentPowerState())
    val powerState: StateFlow<PowerState> = _powerState.asStateFlow()

    private val _isCharging = MutableStateFlow(checkIsCharging())
    val isCharging: StateFlow<Boolean> = _isCharging.asStateFlow()

    private val _isDozing = MutableStateFlow(checkIsDozing())
    val isDozing: StateFlow<Boolean> = _isDozing.asStateFlow()

    private val _isScreenOn = MutableStateFlow(powerManager.isInteractive)
    val isScreenOn: StateFlow<Boolean> = _isScreenOn.asStateFlow()

    private val _batteryLevel = MutableStateFlow(checkBatteryLevel())
    val batteryLevel: StateFlow<Int> = _batteryLevel.asStateFlow()

    private val _isUiVisible = MutableStateFlow(true)
    val isUiVisible: StateFlow<Boolean> = _isUiVisible.asStateFlow()

    private var receiver: BroadcastReceiver? = null
    private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null
    private var visibleActivityCount = 0

    // Timestamps for debugging
    private var screenOffTime: Long = 0
    private var dozeStartTime: Long = 0
    private var backgroundedTime: Long = 0

    fun start() {
        if (receiver != null) {
            Log.w(TAG, "DozeMonitor already started")
            return
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(Intent.ACTION_BATTERY_CHANGED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            }
        }

        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val now = System.currentTimeMillis()

                when (intent.action) {
                    Intent.ACTION_SCREEN_ON -> {
                        _isScreenOn.value = true
                        val offDuration = if (screenOffTime > 0) now - screenOffTime else 0
                        Log.i(TAG, ">>> SCREEN ON (was off for ${offDuration}ms)")
                        if (dozeStartTime > 0) {
                            Log.i(TAG, "    Doze duration: ${now - dozeStartTime}ms")
                            dozeStartTime = 0
                        }
                        updateState()
                    }

                    Intent.ACTION_SCREEN_OFF -> {
                        _isScreenOn.value = false
                        screenOffTime = now
                        Log.i(TAG, ">>> SCREEN OFF — Doze may engage in ~5 minutes")
                        Log.i(TAG, "    charging=${_isCharging.value}, interactive=${powerManager.isInteractive}")
                        updateState()
                    }

                    Intent.ACTION_POWER_CONNECTED -> {
                        _isCharging.value = true
                        Log.i(TAG, ">>> POWER CONNECTED — Doze should be disabled")
                        updateState()
                    }

                    Intent.ACTION_POWER_DISCONNECTED -> {
                        _isCharging.value = false
                        Log.i(TAG, ">>> POWER DISCONNECTED — Doze may engage when screen off")
                        updateState()
                    }

                    Intent.ACTION_BATTERY_CHANGED -> {
                        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                            status == BatteryManager.BATTERY_STATUS_FULL
                        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
                        val batteryPct = if (scale > 0) (level * 100) / scale else level
                        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
                        val pluggedStr = when (plugged) {
                            BatteryManager.BATTERY_PLUGGED_AC -> "AC"
                            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
                            else -> "None"
                        }

                        if (_batteryLevel.value != batteryPct) {
                            _batteryLevel.value = batteryPct
                        }

                        if (_isCharging.value != isCharging) {
                            _isCharging.value = isCharging
                            Log.i(TAG, "    Battery: charging=$isCharging, level=$batteryPct%, plugged=$pluggedStr")
                            updateState()
                        }
                    }

                    PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED -> {
                        val isIdle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            powerManager.isDeviceIdleMode
                        } else false
                        _isDozing.value = isIdle

                        if (isIdle) {
                            dozeStartTime = now
                            val timeSinceScreenOff = if (screenOffTime > 0) now - screenOffTime else -1
                            Log.w(TAG, ">>> DOZE MODE ENTERED!")
                            Log.w(TAG, "    Time since screen off: ${timeSinceScreenOff}ms")
                            Log.w(TAG, "    charging=${_isCharging.value} (SHOULD NOT DOZE IF CHARGING!)")
                            Log.w(TAG, "    interactive=${powerManager.isInteractive}")
                            if (_isCharging.value) {
                                Log.e(TAG, "!!! ANOMALY: Device entered Doze while charging!")
                            }
                        } else {
                            val dozeDuration = if (dozeStartTime > 0) now - dozeStartTime else 0
                            Log.i(TAG, ">>> DOZE MODE EXITED (maintenance window or wakeup)")
                            Log.i(TAG, "    Doze duration: ${dozeDuration}ms")
                        }
                        updateState()
                    }

                    PowerManager.ACTION_POWER_SAVE_MODE_CHANGED -> {
                        val isPowerSaveMode = powerManager.isPowerSaveMode
                        Log.i(TAG, ">>> POWER SAVE MODE: $isPowerSaveMode")
                    }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }

        // Track app foreground/background via activity lifecycle
        val app = context.applicationContext as? Application
        if (app != null) {
            lifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
                override fun onActivityStarted(activity: Activity) {
                    val wasHidden = visibleActivityCount == 0
                    visibleActivityCount++
                    if (wasHidden && backgroundedTime > 0) {
                        val now = System.currentTimeMillis()
                        val hiddenDuration = now - backgroundedTime
                        backgroundedTime = 0
                        Log.i(TAG, ">>> UI VISIBLE (user returned after ${hiddenDuration}ms)")
                    }
                    _isUiVisible.value = true
                }

                override fun onActivityStopped(activity: Activity) {
                    visibleActivityCount--
                    if (visibleActivityCount == 0) {
                        backgroundedTime = System.currentTimeMillis()
                        Log.i(TAG, ">>> UI HIDDEN (user switched away, service still running)")
                        Log.i(TAG, "    Screen on: ${_isScreenOn.value}, charging: ${_isCharging.value}")
                        _isUiVisible.value = false
                    }
                }

                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
                override fun onActivityResumed(activity: Activity) {}
                override fun onActivityPaused(activity: Activity) {}
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
                override fun onActivityDestroyed(activity: Activity) {}
            }
            app.registerActivityLifecycleCallbacks(lifecycleCallbacks)
        }

        updateState()

        Log.i(TAG, "DozeMonitor started")
        Log.i(TAG, "    Initial state: ${_powerState.value}")
        Log.i(TAG, "    Screen on: ${_isScreenOn.value}")
        Log.i(TAG, "    Charging: ${_isCharging.value}")
        Log.i(TAG, "    Dozing: ${_isDozing.value}")
        Log.i(TAG, "    UI visible: ${_isUiVisible.value}")
        Log.i(TAG, "    Battery optimization ignored: ${isIgnoringBatteryOptimizations()}")
    }

    fun stop() {
        receiver?.let { rcv ->
            try {
                context.unregisterReceiver(rcv)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to unregister receiver", e)
            }
            receiver = null
        }

        lifecycleCallbacks?.let { callbacks ->
            val app = context.applicationContext as? Application
            app?.unregisterActivityLifecycleCallbacks(callbacks)
            lifecycleCallbacks = null
        }

        Log.i(TAG, "DozeMonitor stopped")
    }

    private fun getCurrentPowerState(): PowerState {
        val isCharging = checkIsCharging()
        val isDozing = checkIsDozing()
        val isInteractive = powerManager.isInteractive

        return when {
            isCharging && isDozing -> PowerState.ChargingButDozing
            isCharging -> PowerState.Charging
            isDozing -> PowerState.Dozing
            !isInteractive -> PowerState.ScreenOff
            else -> PowerState.Active
        }
    }

    private fun updateState() {
        val newState = getCurrentPowerState()
        val oldState = _powerState.value
        if (oldState != newState) {
            Log.i(TAG, "State transition: $oldState -> $newState")
        }
        _powerState.value = newState
    }

    private fun checkIsCharging(): Boolean {
        val batteryStatus = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        return batteryStatus?.let { intent ->
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
        } ?: false
    }

    private fun checkBatteryLevel(): Int {
        val batteryStatus = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        return batteryStatus?.let { intent ->
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            if (scale > 0) (level * 100) / scale else level
        } ?: -1
    }

    private fun checkIsDozing(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isDeviceIdleMode
        } else {
            false
        }
    }

    /**
     * Check if app is exempt from battery optimization (can use network during Doze).
     */
    fun isIgnoringBatteryOptimizations(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true
        }
    }

    /**
     * Get a debug summary of current power state for log panel / RPC.
     */
    fun getDebugSummary(): String {
        return buildString {
            appendLine("Power State: ${_powerState.value}")
            appendLine("Screen on: ${_isScreenOn.value}")
            appendLine("Charging: ${_isCharging.value}")
            appendLine("Battery level: ${_batteryLevel.value}%")
            appendLine("Dozing: ${_isDozing.value}")
            appendLine("UI visible: ${_isUiVisible.value}")
            appendLine("Interactive: ${powerManager.isInteractive}")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                appendLine("Device idle mode: ${powerManager.isDeviceIdleMode}")
                appendLine("Power save mode: ${powerManager.isPowerSaveMode}")
                appendLine("Battery opt ignored: ${isIgnoringBatteryOptimizations()}")
            }
            if (screenOffTime > 0 && !_isScreenOn.value) {
                val elapsed = System.currentTimeMillis() - screenOffTime
                appendLine("Screen off for: ${elapsed}ms")
            }
            if (dozeStartTime > 0 && _isDozing.value) {
                val elapsed = System.currentTimeMillis() - dozeStartTime
                appendLine("In Doze for: ${elapsed}ms")
            }
            if (backgroundedTime > 0 && !_isUiVisible.value) {
                val elapsed = System.currentTimeMillis() - backgroundedTime
                appendLine("UI hidden for: ${elapsed}ms")
            }
        }
    }
}
