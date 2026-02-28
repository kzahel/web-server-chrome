package app.ok200.android.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

private const val PREFS_NAME = "ok200_prefs"

/**
 * Centralized settings backed by SharedPreferences.
 * All keys use the same prefs file as before for backward compatibility.
 */
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // --- Server settings (existing) ---

    var port: Int
        get() = prefs.getInt(KEY_PORT, 8080)
        set(value) = prefs.edit { putInt(KEY_PORT, value) }

    var rootUri: String?
        get() = prefs.getString(KEY_ROOT_URI, null)
        set(value) = prefs.edit { putString(KEY_ROOT_URI, value) }

    var rootDisplayName: String?
        get() = prefs.getString(KEY_ROOT_DISPLAY, null)
        set(value) = prefs.edit { putString(KEY_ROOT_DISPLAY, value) }

    var allFilesAccess: Boolean
        get() = prefs.getBoolean(KEY_ALL_FILES_ACCESS, false)
        set(value) = prefs.edit { putBoolean(KEY_ALL_FILES_ACCESS, value) }

    // --- Power management settings (new) ---

    /**
     * Whether the server should continue running when the app is backgrounded.
     * Default ON — a server's value is availability.
     */
    var backgroundEnabled: Boolean
        get() = prefs.getBoolean(KEY_BACKGROUND_ENABLED, true)
        set(value) = prefs.edit { putBoolean(KEY_BACKGROUND_ENABLED, value) }

    /**
     * How aggressively to keep the device awake while serving.
     * Default WIFI_ONLY — keeps LAN reachability without burning CPU.
     */
    var wakeLockMode: WakeLockMode
        get() = WakeLockMode.fromString(
            prefs.getString(KEY_WAKE_LOCK_MODE, WakeLockMode.WIFI_ONLY.key) ?: WakeLockMode.WIFI_ONLY.key
        )
        set(value) = prefs.edit { putString(KEY_WAKE_LOCK_MODE, value.key) }

    /**
     * Whether to auto-start the server on device boot.
     * Default OFF — user must opt in.
     */
    var startOnBoot: Boolean
        get() = prefs.getBoolean(KEY_START_ON_BOOT, false)
        set(value) = prefs.edit { putBoolean(KEY_START_ON_BOOT, value) }

    /**
     * Whether to stop the server when battery drops below threshold.
     * Default OFF.
     */
    var shutdownOnLowBattery: Boolean
        get() = prefs.getBoolean(KEY_SHUTDOWN_ON_LOW_BATTERY, false)
        set(value) = prefs.edit { putBoolean(KEY_SHUTDOWN_ON_LOW_BATTERY, value) }

    /**
     * Battery percentage threshold for shutdown (5-50%).
     * Default 15%.
     */
    var shutdownBatteryThreshold: Int
        get() = prefs.getInt(KEY_SHUTDOWN_BATTERY_THRESHOLD, 15)
        set(value) = prefs.edit { putInt(KEY_SHUTDOWN_BATTERY_THRESHOLD, value.coerceIn(5, 50)) }

    companion object {
        // Existing keys (unchanged for backward compatibility)
        const val KEY_PORT = "port"
        const val KEY_ROOT_URI = "root_uri"
        const val KEY_ROOT_DISPLAY = "root_display"
        const val KEY_ALL_FILES_ACCESS = "all_files_access"

        // New power management keys
        private const val KEY_BACKGROUND_ENABLED = "background_enabled"
        private const val KEY_WAKE_LOCK_MODE = "wake_lock_mode"
        private const val KEY_START_ON_BOOT = "start_on_boot"
        private const val KEY_SHUTDOWN_ON_LOW_BATTERY = "shutdown_on_low_battery"
        private const val KEY_SHUTDOWN_BATTERY_THRESHOLD = "shutdown_battery_threshold"
    }
}

/**
 * Three-tier wake lock aggressiveness.
 */
enum class WakeLockMode(val key: String, val label: String) {
    /** No locks — battery priority. Server may become unreachable when screen off. */
    NONE("none", "None"),

    /** WiFi lock only — keeps network alive, allows CPU to sleep between requests. */
    WIFI_ONLY("wifi_only", "WiFi only"),

    /** CPU + WiFi locks — maximum reliability, highest battery usage. */
    FULL("full", "CPU + WiFi");

    companion object {
        fun fromString(key: String): WakeLockMode =
            entries.firstOrNull { it.key == key } ?: WIFI_ONLY
    }
}
