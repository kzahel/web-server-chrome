package app.ok200.android

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.ok200.android.ui.LockedSettingsContainer
import app.ok200.android.ui.theme.Ok200Theme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LockedSettingsInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun tappingLockedSettingsInvokesExplanationAction() {
        var lockTaps = 0
        composeRule.setContent {
            Ok200Theme {
                LockedSettingsContainer(
                    locked = true,
                    onLockedClick = { lockTaps += 1 }
                ) {
                    Text("Port")
                }
            }
        }

        composeRule.onNodeWithTag("locked-settings-overlay").performClick()

        assertEquals(1, lockTaps)
    }
}
