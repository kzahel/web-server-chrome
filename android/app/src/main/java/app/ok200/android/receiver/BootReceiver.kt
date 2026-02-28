package app.ok200.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import app.ok200.android.Ok200Application
import app.ok200.android.service.WebServerService

private const val TAG = "BootReceiver"

/**
 * Starts the web server on device boot if the user has enabled "Start on boot".
 *
 * Checks that a root URI is configured and valid before starting.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val app = context.applicationContext as Ok200Application
        val settings = app.settingsStore

        if (!settings.startOnBoot) {
            Log.i(TAG, "Start on boot disabled, ignoring")
            return
        }

        val rootUriStr = settings.rootUri
        if (rootUriStr.isNullOrBlank()) {
            Log.w(TAG, "No root URI configured, cannot start on boot")
            return
        }

        val rootUri = Uri.parse(rootUriStr)
        val port = settings.port

        Log.i(TAG, "Starting server on boot (port=$port, root=$rootUriStr)")

        // Mark as boot-started so ServiceLifecycleManager doesn't interfere
        app.serviceLifecycleManager.markBootStarted()

        // Set the serving root URI
        app.servingRootUri = rootUri

        // Initialize engine and start server
        try {
            val controller = app.initializeEngine()
            controller.startServer(port, "0.0.0.0")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize engine on boot", e)
            return
        }

        // Start foreground service
        val serviceIntent = Intent(context, WebServerService::class.java)
        context.startForegroundService(serviceIntent)

        Log.i(TAG, "Boot start initiated")
    }
}
