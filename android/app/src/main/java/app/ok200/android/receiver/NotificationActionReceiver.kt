package app.ok200.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import app.ok200.android.Ok200Application
import app.ok200.android.service.WebServerService

private const val TAG = "NotificationAction"

/**
 * Handles action buttons from the foreground service notification.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_STOP_SERVER = "app.ok200.android.action.STOP_SERVER"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_STOP_SERVER -> {
                Log.i(TAG, "Stop server requested from notification")
                val app = context.applicationContext as Ok200Application
                app.engineController?.stopServer()
                // Service will be stopped by ServiceLifecycleManager
                // reacting to serverIsRunning becoming false
            }
        }
    }
}
