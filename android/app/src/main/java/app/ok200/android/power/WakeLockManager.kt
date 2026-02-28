package app.ok200.android.power

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import app.ok200.android.settings.WakeLockMode

private const val TAG = "WakeLockManager"

/**
 * Manages CPU and WiFi wake locks for the foreground service.
 *
 * Locks are held for the entire service lifetime — if the server is running
 * in the background, locks are active per the user's mode setting.
 */
class WakeLockManager(private val context: Context) {

    private var cpuWakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    /**
     * Acquire locks according to the given mode.
     */
    fun acquire(mode: WakeLockMode) {
        when (mode) {
            WakeLockMode.NONE -> {
                Log.i(TAG, "Wake lock mode: NONE (no locks acquired)")
            }
            WakeLockMode.WIFI_ONLY -> {
                acquireWifiLock()
                Log.i(TAG, "Wake lock mode: WIFI_ONLY")
            }
            WakeLockMode.FULL -> {
                acquireCpuWakeLock()
                acquireWifiLock()
                Log.i(TAG, "Wake lock mode: FULL (CPU + WiFi)")
            }
        }
    }

    /**
     * Release all held locks.
     */
    fun release() {
        releaseCpuWakeLock()
        releaseWifiLock()
    }

    /**
     * Change mode at runtime: release current locks and acquire new ones.
     */
    fun updateMode(newMode: WakeLockMode) {
        release()
        acquire(newMode)
    }

    private fun acquireCpuWakeLock() {
        if (cpuWakeLock != null) return
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        cpuWakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Ok200::ServerWakeLock"
        ).apply {
            acquire()
        }
        Log.i(TAG, "CPU wake lock acquired")
    }

    @Suppress("DEPRECATION")
    private fun acquireWifiLock() {
        if (wifiLock != null) return
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiManager.WIFI_MODE_FULL_LOW_LATENCY
        } else {
            WifiManager.WIFI_MODE_FULL_HIGH_PERF
        }
        wifiLock = wm.createWifiLock(mode, "Ok200::ServerWifiLock").apply {
            acquire()
        }
        Log.i(TAG, "WiFi lock acquired")
    }

    private fun releaseCpuWakeLock() {
        cpuWakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.i(TAG, "CPU wake lock released")
            }
        }
        cpuWakeLock = null
    }

    private fun releaseWifiLock() {
        wifiLock?.let {
            if (it.isHeld) {
                it.release()
                Log.i(TAG, "WiFi lock released")
            }
        }
        wifiLock = null
    }
}
