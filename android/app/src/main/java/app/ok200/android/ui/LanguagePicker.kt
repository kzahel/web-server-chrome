package app.ok200.android.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import app.ok200.android.localization.rememberAppLanguage
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.core.os.LocaleListCompat
import app.ok200.android.R
import java.util.Locale

/** AppCompat persists the app locale; the application-scoped server survives recreation. */
@Composable
fun LanguagePicker() {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    val systemLabel = stringResource(R.string.language_system)
    val currentLabel = if (current.isBlank()) systemLabel else {
        Locale.forLanguageTag(current).getDisplayName(Locale.forLanguageTag(current))
    }
    Column {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.testTag("language-picker")) {
            Text(stringResource(R.string.language_selection, currentLabel))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            (listOf("") + SupportedLanguages.tags).forEach { tag ->
                DropdownMenuItem(
                    text = {
                        Text(if (tag.isEmpty()) systemLabel else {
                            Locale.forLanguageTag(tag).getDisplayName(Locale.forLanguageTag(tag))
                        })
                    },
                    onClick = {
                        expanded = false
                        context.rememberAppLanguage(tag)
                        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
                    }
                )
            }
        }
    }
}
