package app.ok200.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.net.Uri
import android.util.Log
import app.ok200.android.power.DozeMonitor
import app.ok200.android.service.ServiceLifecycleManager
import app.ok200.android.settings.SettingsStore
import app.ok200.quickjs.EngineController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

private const val TAG = "Ok200Application"

class Ok200Application : Application() {

    object NotificationChannels {
        const val SERVICE = "ok200_service"
    }

    lateinit var settingsStore: SettingsStore
        private set

    lateinit var dozeMonitor: DozeMonitor
        private set

    lateinit var serviceLifecycleManager: ServiceLifecycleManager
        private set

    private val engineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var _engineController: EngineController? = null
    private val engineLock = Any()

    val engineController: EngineController?
        get() = _engineController

    // Root URI for file serving (set by UI when user picks a folder)
    @Volatile
    var servingRootUri: Uri? = null

    override fun onCreate() {
        super.onCreate()

        settingsStore = SettingsStore(this)

        dozeMonitor = DozeMonitor(this)
        dozeMonitor.start()

        serviceLifecycleManager = ServiceLifecycleManager(
            context = this,
            settingsStore = settingsStore
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

    fun initializeEngine(): EngineController {
        _engineController?.let { return it }

        synchronized(engineLock) {
            _engineController?.let { return it }

            Log.i(TAG, "Initializing engine...")
            val controller = EngineController(
                context = this,
                scope = engineScope,
                rootUriProvider = { servingRootUri }
            )
            controller.loadEngine()
            _engineController = controller
            Log.i(TAG, "Engine initialized")
            return controller
        }
    }

    fun shutdownEngine() {
        synchronized(engineLock) {
            _engineController?.close()
            _engineController = null
        }
    }
}
