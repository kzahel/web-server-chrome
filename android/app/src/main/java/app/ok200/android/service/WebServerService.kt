package app.ok200.android.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import app.ok200.android.MainActivity
import app.ok200.android.Ok200Application
import app.ok200.android.R
import app.ok200.android.settings.WakeLockMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val TAG = "WebServerService"
private const val NOTIFICATION_ID = 1

/** Foreground-service adapter for background and boot-started server runs. */
class WebServerService : Service() {
    private val app: Ok200Application
        get() = application as Ok200Application

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var foregroundAccepted = false

    override fun onCreate() {
        super.onCreate()
        if (!ServiceNotificationPolicy.canShowOngoingNotification(this)) {
            rejectHiddenForegroundService()
            return
        }
        foregroundAccepted = true
        startForeground(NOTIFICATION_ID, buildNotification())
        serviceScope.launch {
            app.serverController.state.collectLatest {
                getSystemService(NotificationManager::class.java)
                    .notify(NOTIFICATION_ID, buildNotification())
            }
        }
        serviceScope.launch {
            while (isActive) {
                delay(NOTIFICATION_CHECK_INTERVAL_MILLIS)
                if (!ServiceNotificationPolicy.canShowOngoingNotification(this@WebServerService)) {
                    rejectHiddenForegroundService()
                    break
                }
            }
        }
        Log.i(TAG, "Foreground service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!foregroundAccepted || !ServiceNotificationPolicy.canShowOngoingNotification(this)) {
            rejectHiddenForegroundService()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        when (intent?.action) {
            ACTION_STOP -> app.serverController.requestStop()
            ACTION_START, null -> {
                if (app.settingsStore.desiredRunning || intent?.action == ACTION_START) {
                    app.serverController.requestStartFromService()
                } else {
                    stopSelf()
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        serviceScope.cancel()
        Log.i(TAG, "Foreground service destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun rejectHiddenForegroundService() {
        foregroundAccepted = false
        app.serverController.onNotificationAvailabilityChanged(false)
        stopSelf()
        Log.w(TAG, "Reliable background stopped: notification unavailable")
    }

    private fun buildNotification(): Notification {
        val state = app.serverController.state.value
        val port = if (state.port > 0) state.port else app.settingsStore.port
        val lock = when (app.settingsStore.wakeLockMode) {
            WakeLockMode.FULL -> getString(R.string.notification_wake_lock_cpu_wifi)
            WakeLockMode.WIFI_ONLY -> getString(R.string.notification_wake_lock_wifi)
            WakeLockMode.NONE -> ""
        }
        val content = when {
            state.running -> getString(R.string.notification_serving_on_port, port, lock)
            state.error != null -> state.error
            else -> getString(R.string.notification_starting)
        }
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPending = PendingIntent.getService(
            this,
            1,
            stopIntent(this),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, SERVICE_NOTIFICATION_CHANNEL_ID)
            .setContentTitle(getString(R.string.brand_name))
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openPending)
            .addAction(0, getString(R.string.action_stop), stopPending)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    companion object {
        private const val NOTIFICATION_CHECK_INTERVAL_MILLIS = 5_000L
        const val ACTION_START = "app.ok200.android.action.START_SERVER"
        const val ACTION_STOP = "app.ok200.android.action.STOP_SERVER"

        fun startIntent(context: Context): Intent =
            Intent(context, WebServerService::class.java).setAction(ACTION_START)

        fun stopIntent(context: Context): Intent =
            Intent(context, WebServerService::class.java).setAction(ACTION_STOP)
    }
}
