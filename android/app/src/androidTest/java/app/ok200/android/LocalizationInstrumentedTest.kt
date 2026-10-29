package app.ok200.android

import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Environment
import app.ok200.android.localization.localizedContext
import app.ok200.android.settings.ServerLifetimeMode
import java.io.File
import java.net.URL
import kotlinx.coroutines.runBlocking
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.core.os.LocaleListCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale

@RunWith(AndroidJUnit4::class)
class LocalizationInstrumentedTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun translatedResourcesAndRecreationPreserveApplicationController() {
        val target = InstrumentationRegistry.getArguments().getString("ok200Locale") ?: "de"
        val targetLocale = Locale.forLanguageTag(target)
        val activity = composeRule.activity
        val application = activity.application as Ok200Application
        val controller = application.serverController
        val settings = application.settingsStore
        val originalRoot = settings.rootUri
        val originalPort = settings.port
        val originalLan = settings.lanEnabled
        val originalLifetime = settings.lifetimeMode
        val fixture = File(application.cacheDir, "localization-fixture")
        val canServe = Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()
        if (canServe) {
            fixture.mkdirs()
            File(fixture, "hello.txt").writeText("hello from localization")
            settings.rootUri = Uri.fromFile(fixture).toString()
            settings.port = java.net.ServerSocket(0).use { it.localPort }
            settings.lanEnabled = false
            settings.lifetimeMode = ServerLifetimeMode.APP_OPEN
            assertTrue(runBlocking { controller.startNow(reliableRun = false) }.running)
        }
        val before = controller.state.value
        val configuration = Configuration(activity.resources.configuration)
        configuration.setLocale(targetLocale)
        val german = activity.createConfigurationContext(configuration)
        assertEquals("200 OK Web Server", german.getString(R.string.app_name))
        assertTrue(german.getString(R.string.action_stop_server).isNotBlank())
        val original = AppCompatDelegate.getApplicationLocales()
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(target))
            }
            composeRule.waitForIdle()
            composeRule.onNodeWithTag("server-toggle").assertIsDisplayed()
            assertEquals(targetLocale.language, application.localizedContext().resources.configuration.locales[0].language)
            assertEquals(before, controller.state.value)
            if (canServe) {
                val connection = URL("http://127.0.0.1:${before.port}/hello.txt").openConnection().apply {
                    connectTimeout = 2000
                    readTimeout = 2000
                }
                assertEquals("hello from localization", connection.getInputStream().bufferedReader().use { it.readText() })
            }
            assertTrue(controller === application.serverController)
        } finally {
            if (canServe) {
                runBlocking { controller.stopNow() }
                settings.rootUri = originalRoot
                settings.port = originalPort
                settings.lanEnabled = originalLan
                settings.lifetimeMode = originalLifetime
                fixture.deleteRecursively()
            }
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                AppCompatDelegate.setApplicationLocales(original)
            }
        }
    }
}
