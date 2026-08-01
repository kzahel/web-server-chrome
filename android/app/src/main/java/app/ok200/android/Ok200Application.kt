package app.ok200.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.ok200.android.power.DozeMonitor
import app.ok200.android.server.AndroidServerController
import app.ok200.android.settings.SettingsStore

class Ok200Application : Application() {

    object NotificationChannels {
        const val SERVICE = "ok200_service"
    }

    lateinit var settingsStore: SettingsStore
        private set

    lateinit var dozeMonitor: DozeMonitor
        private set

    lateinit var serverController: AndroidServerController
        private set

    override fun onCreate() {
        super.onCreate()
        settingsStore = SettingsStore(this)
        dozeMonitor = DozeMonitor(this).also { it.start() }
        serverController = AndroidServerController(this, settingsStore, dozeMonitor)
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) {
                    serverController.onAppBackgrounded()
                }
            }
        )
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannels.SERVICE,
                "Web Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows when 200 OK is serving"
                setShowBadge(false)
            }
        )
    }
}
