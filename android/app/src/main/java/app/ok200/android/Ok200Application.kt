package app.ok200.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.ok200.android.power.DozeMonitor
import app.ok200.android.server.AndroidServerController
import app.ok200.android.service.SERVICE_NOTIFICATION_CHANNEL_ID
import app.ok200.android.settings.SettingsStore

class Ok200Application : Application() {

    val settingsStore: SettingsStore by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        SettingsStore(this)
    }

    val dozeMonitor: DozeMonitor by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        DozeMonitor(this).also { it.start() }
    }

    val serverController: AndroidServerController by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AndroidServerController(this, settingsStore, dozeMonitor)
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        // Eager during normal startup, while remaining safe if a debug provider
        // is Android's first component and accesses these before onCreate().
        serverController
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) {
                    serverController.onAppBackgrounded()
                }
            }
        )
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                SERVICE_NOTIFICATION_CHANNEL_ID,
                "Web Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows when 200 OK is serving"
                setShowBadge(false)
            }
        )
    }
}
