package app.ok200.android

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.ok200.android.settings.ServerLifetimeMode
import app.ok200.android.settings.SettingsStore
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ServerLifetimeSettingsInstrumentedTest {
    @Test
    fun persistsAllLifetimeModes() {
        val context = ApplicationProvider.getApplicationContext<Ok200Application>()
        val settings = SettingsStore(context)
        val original = settings.lifetimeMode

        try {
            ServerLifetimeMode.entries.forEach { mode ->
                settings.lifetimeMode = mode
                assertEquals(mode, SettingsStore(context).lifetimeMode)
            }
        } finally {
            settings.lifetimeMode = original
        }
    }
}
