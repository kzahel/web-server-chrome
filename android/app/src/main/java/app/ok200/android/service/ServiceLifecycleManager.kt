package app.ok200.android.service

import android.content.Context
import android.content.Intent
import android.util.Log
import app.ok200.android.settings.SettingsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val TAG = "ServiceLifecycleManager"

/**
 * Decides when to start/stop the foreground service based on:
 * - Whether the server is running
 * - Whether the app is in the foreground
 * - Whether background mode is enabled
 *
 * Handles the race condition where stopService() cannot be called between
 * startForegroundService() and the service's onCreate().
 */
class ServiceLifecycleManager(
    private val context: Context,
    private val settingsStore: SettingsStore
) {
    private val _isActivityForeground = MutableStateFlow(false)
    val isActivityForeground: StateFlow<Boolean> = _isActivityForeground.asStateFlow()

    private var serverIsRunning = false
    private var serviceRunning = false
    private var serviceStartPending = false
    private var hasEverBeenForeground = false

    /**
     * True if the service was started by BootReceiver (not by activity lifecycle).
     * Prevents ServiceLifecycleManager from stopping a boot-started service
     * when the user first opens the app.
     */
    private var bootStarted = false

    /**
     * Called from MainActivity.onStart().
     */
    fun onActivityStart() {
        _isActivityForeground.value = true
        hasEverBeenForeground = true

        // When user returns to the app, stop the foreground service
        // (server keeps running in-process, just no notification needed)
        if (serviceRunning && !serviceStartPending && !bootStarted) {
            Log.i(TAG, "Activity foregrounded — stopping foreground service")
            stopService()
        }

        // Clear boot flag once user has interacted
        bootStarted = false
    }

    /**
     * Called from MainActivity.onStop().
     */
    fun onActivityStop() {
        _isActivityForeground.value = false
        updateServiceState()
    }

    /**
     * Called when engine reports server state change.
     */
    fun onServerStateChanged(running: Boolean) {
        val wasRunning = serverIsRunning
        serverIsRunning = running

        if (wasRunning && !running && serviceRunning) {
            // Server stopped — stop the service
            Log.i(TAG, "Server stopped — stopping foreground service")
            if (!serviceStartPending) {
                stopService()
            }
        } else if (!wasRunning && running) {
            updateServiceState()
        }
    }

    /**
     * Called from WebServerService.onCreate() to clear the pending flag.
     */
    fun onServiceCreated() {
        serviceStartPending = false
        serviceRunning = true
        Log.i(TAG, "Service created (pending cleared)")
    }

    /**
     * Check if the service should stop itself immediately in onCreate().
     * This handles the race where the activity returned to foreground
     * while startForegroundService() was pending.
     */
    fun shouldServiceStopImmediately(): Boolean {
        // Don't stop if boot-started
        if (bootStarted) return false
        // Don't stop if server is running and background is needed
        if (serverIsRunning && !_isActivityForeground.value && settingsStore.backgroundEnabled) return false
        // Stop if activity is foreground (user came back before service started)
        if (_isActivityForeground.value) {
            Log.i(TAG, "Service should stop immediately — activity is foreground")
            return true
        }
        return false
    }

    /**
     * Called from WebServerService.onDestroy().
     */
    fun onServiceStopped() {
        serviceRunning = false
        serviceStartPending = false
        Log.i(TAG, "Service stopped")
    }

    /**
     * Mark that the service was started by BootReceiver.
     */
    fun markBootStarted() {
        bootStarted = true
        Log.i(TAG, "Marked as boot-started")
    }

    private fun updateServiceState() {
        val shouldRun = settingsStore.backgroundEnabled &&
            serverIsRunning &&
            !_isActivityForeground.value &&
            hasEverBeenForeground

        if (shouldRun && !serviceRunning && !serviceStartPending) {
            Log.i(TAG, "Starting foreground service (bg=$settingsStore.backgroundEnabled, server=$serverIsRunning)")
            startService()
        } else if (!shouldRun && serviceRunning && !serviceStartPending) {
            Log.i(TAG, "Stopping foreground service")
            stopService()
        }
    }

    private fun startService() {
        serviceStartPending = true
        val intent = Intent(context, WebServerService::class.java)
        context.startForegroundService(intent)
    }

    private fun stopService() {
        val intent = Intent(context, WebServerService::class.java)
        context.stopService(intent)
    }
}
