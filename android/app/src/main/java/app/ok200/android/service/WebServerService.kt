package app.ok200.android.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import app.ok200.android.MainActivity
import app.ok200.android.Ok200Application
import app.ok200.android.R
import app.ok200.android.power.WakeLockManager
import app.ok200.android.receiver.NotificationActionReceiver
import app.ok200.android.settings.WakeLockMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private const val TAG = "WebServerService"
private const val NOTIFICATION_ID = 1

/**
 * Foreground service that keeps the web server running when the app is backgrounded.
 *
 * Manages wake locks (CPU and WiFi) based on user settings,
 * monitors battery level for low-battery shutdown,
 * and provides a notification with a stop action.
 */
class WebServerService : Service() {

    companion object {
        @Volatile
        var instance: WebServerService? = null
            private set
    }

    private val app: Ok200Application
        get() = application as Ok200Application

    private var wakeLockManager: WakeLockManager? = null
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var notificationUpdateJob: Job? = null
    private var batteryMonitorJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "Service created")

        // CRITICAL: Must call startForeground within 5 seconds of startForegroundService()
        startForeground(NOTIFICATION_ID, buildNotification())

        // Notify lifecycle manager
        app.serviceLifecycleManager.onServiceCreated()

        // Check if should stop immediately (race condition: activity returned before we started)
        if (app.serviceLifecycleManager.shouldServiceStopImmediately()) {
            Log.i(TAG, "Stopping immediately — activity is foreground")
            stopSelf()
            return
        }

        // Acquire wake locks per user setting
        wakeLockManager = WakeLockManager(this).apply {
            acquire(app.settingsStore.wakeLockMode)
        }

        // Start notification updates from engine state
        startNotificationUpdates()

        // Start battery monitoring if enabled
        if (app.settingsStore.shutdownOnLowBattery) {
            startBatteryMonitoring()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Ensure startForeground is called on re-delivery
        startForeground(NOTIFICATION_ID, buildNotification())
        Log.i(TAG, "Service started in foreground")
        return START_STICKY
    }

    override fun onDestroy() {
        instance = null
        wakeLockManager?.release()
        wakeLockManager = null
        notificationUpdateJob?.cancel()
        batteryMonitorJob?.cancel()
        serviceScope.cancel()
        app.serviceLifecycleManager.onServiceStopped()
        Log.i(TAG, "Service destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Update wake lock mode at runtime (called from ViewModel when user changes setting).
     */
    fun updateWakeLockMode(mode: WakeLockMode) {
        wakeLockManager?.updateMode(mode)
    }

    private fun startNotificationUpdates() {
        notificationUpdateJob = serviceScope.launch {
            val controller = app.engineController ?: return@launch
            controller.state.collect { state ->
                val notification = buildNotification()
                val nm = getSystemService(NotificationManager::class.java)
                nm.notify(NOTIFICATION_ID, notification)
            }
        }
    }

    private fun startBatteryMonitoring() {
        batteryMonitorJob = serviceScope.launch {
            app.dozeMonitor.batteryLevel.collectLatest { level ->
                if (level in 1..app.settingsStore.shutdownBatteryThreshold &&
                    !app.dozeMonitor.isCharging.value &&
                    app.settingsStore.shutdownOnLowBattery
                ) {
                    Log.w(TAG, "Battery low ($level%) — stopping server")
                    app.engineController?.stopServer()
                    // Service will be stopped by lifecycle manager
                }
            }
        }
    }

    private fun buildNotification(): Notification {
        val state = app.engineController?.state?.value
        val port = state?.port ?: app.settingsStore.port
        val wakeLockIndicator = when (app.settingsStore.wakeLockMode) {
            WakeLockMode.FULL -> " · CPU+WiFi lock"
            WakeLockMode.WIFI_ONLY -> " · WiFi lock"
            WakeLockMode.NONE -> ""
        }
        val contentText = if (state?.running == true) {
            "Serving on port $port$wakeLockIndicator"
        } else {
            "Starting..."
        }

        // Tap notification → open app
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Stop action button
        val stopIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_STOP_SERVER
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Ok200Application.NotificationChannels.SERVICE)
            .setContentTitle("200 OK")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
