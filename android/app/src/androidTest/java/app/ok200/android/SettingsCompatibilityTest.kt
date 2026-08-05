package app.ok200.android

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.ok200.android.settings.PREFS_NAME
import app.ok200.android.settings.SettingsStore
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsCompatibilityTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @After
    fun clearFixtureSettings() {
        preferences.edit().clear().commit()
    }

    @Test
    fun frozenSettingsCoverOldCurrentFutureAndInvalidForms() {
        val corpus = context.assets.open("corpus-v1.json").bufferedReader().use { JSONObject(it.readText()) }
        val fixtures = corpus.getJSONObject("persistedSettings").getJSONArray("android")

        for (index in 0 until fixtures.length()) {
            preferences.edit().clear().commit()
            val fixture = fixtures.getJSONObject(index)
            val values = fixture.getJSONObject("values")
            val editor = preferences.edit()
            values.keys().forEach { key ->
                when (val value = values.get(key)) {
                    is Boolean -> editor.putBoolean(key, value)
                    is Int -> editor.putInt(key, value)
                    is String -> editor.putString(key, value)
                    else -> error("Unsupported fixture value for $key")
                }
            }
            editor.commit()

            val expected = fixture.getJSONObject("expected")
            val settings = SettingsStore(context)
            val id = fixture.getString("id")
            assertEquals("$id port", expected.getInt("port"), settings.port)
            assertEquals("$id LAN", expected.getBoolean("lanEnabled"), settings.lanEnabled)
            assertEquals(
                "$id directory listing",
                expected.getBoolean("directoryListing"),
                settings.directoryListing
            )
            assertEquals("$id CORS", expected.getBoolean("corsEnabled"), settings.corsEnabled)
            assertEquals("$id SPA", expected.getBoolean("spaEnabled"), settings.spaEnabled)
            assertEquals("$id lifetime", expected.getString("lifetimeMode"), settings.lifetimeMode.key)
            assertEquals("$id wake lock", expected.getString("wakeLockMode"), settings.wakeLockMode.key)
            assertEquals(
                "$id battery threshold",
                expected.getInt("shutdownBatteryThreshold"),
                settings.shutdownBatteryThreshold
            )
        }
    }
}
