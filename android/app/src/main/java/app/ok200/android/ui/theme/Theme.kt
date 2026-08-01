package app.ok200.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BrandYellow = Color(0xFFF8D203)
private val BrandYellowDark = Color(0xFFB99700)

private val DarkColorScheme = darkColorScheme(
    primary = BrandYellow,
    onPrimary = Color(0xFF1A1A1A),
    primaryContainer = Color(0xFF4A4100),
    onPrimaryContainer = Color(0xFFFFF2A8)
)
private val LightColorScheme = lightColorScheme(
    primary = BrandYellowDark,
    onPrimary = Color(0xFF1A1A1A),
    primaryContainer = Color(0xFFFFF3AD),
    onPrimaryContainer = Color(0xFF2A2400)
)

@Composable
fun Ok200Theme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    @Suppress("UNUSED_PARAMETER") dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
