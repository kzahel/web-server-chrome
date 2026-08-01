package app.ok200.android.service

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

const val SERVICE_NOTIFICATION_CHANNEL_ID = "ok200_service"

/** Product-level prerequisite for reliable background serving. */
object ServiceNotificationPolicy {
    fun canShowOngoingNotification(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val channel = manager.getNotificationChannel(SERVICE_NOTIFICATION_CHANNEL_ID)
            if (channel?.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }
}
