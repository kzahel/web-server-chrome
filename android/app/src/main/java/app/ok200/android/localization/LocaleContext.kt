package app.ok200.android.localization

import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate

private const val PREFERENCES = "ok200-presentation"
private const val LANGUAGE = "language"

/** Services and boot-started controllers also need the app locale before API 33. */
fun Context.localizedContext(): Context {
    val tags = if (Build.VERSION.SDK_INT >= 33) {
        getSystemService(LocaleManager::class.java).applicationLocales.toLanguageTags()
    } else {
        AppCompatDelegate.getApplicationLocales().toLanguageTags().ifBlank {
            getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(LANGUAGE, "").orEmpty()
        }
    }
    if (tags.isBlank()) return this
    val configuration = Configuration(resources.configuration)
    configuration.setLocales(LocaleList.forLanguageTags(tags))
    return createConfigurationContext(configuration)
}

fun Context.rememberAppLanguage(tags: String) {
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString(LANGUAGE, tags).apply()
}
