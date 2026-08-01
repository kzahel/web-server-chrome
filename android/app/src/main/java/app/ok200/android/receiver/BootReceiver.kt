package app.ok200.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import app.ok200.android.Ok200Application
import app.ok200.android.service.ServiceNotificationPolicy
import app.ok200.android.service.WebServerService
import app.ok200.android.settings.ServerLifetimeMode

private const val TAG = "BootReceiver"

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val app = context.applicationContext as Ok200Application
        val settings = app.settingsStore
        if (!settings.startOnBoot || settings.rootUri.isNullOrBlank()) {
            Log.i(TAG, "Boot start skipped: disabled or no root")
            return
        }
        if (settings.lifetimeMode != ServerLifetimeMode.RELIABLE ||
            !ServiceNotificationPolicy.canShowOngoingNotification(context)
        ) {
            settings.startOnBoot = false
            settings.desiredRunning = false
            settings.reliableNotificationBlockedNotice = true
            Log.w(TAG, "Boot start disabled: Reliable background notification unavailable")
            return
        }
        settings.desiredRunning = true
        ContextCompat.startForegroundService(context, WebServerService.startIntent(context))
        Log.i(TAG, "Boot start requested")
    }
}
