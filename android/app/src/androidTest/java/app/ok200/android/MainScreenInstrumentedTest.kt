package app.ok200.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainScreenInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainScreenExposesCoreAndAdvancedControls() {
        composeRule.onNodeWithText("200 OK").assertIsDisplayed()
        composeRule.onNodeWithTag("app-logo").assertIsDisplayed()
        composeRule.onNodeWithTag("server-toggle").assertIsDisplayed()
        composeRule.onNodeWithText("Serving folder").assertIsDisplayed()
        composeRule.onNodeWithTag("server-status").assertIsDisplayed()

        val serverTop = composeRule.onNodeWithTag("server-status").fetchSemanticsNode().boundsInRoot.top
        val rootTop = composeRule.onNodeWithTag("root-card").fetchSemanticsNode().boundsInRoot.top
        assertTrue("Server control should appear above folder and serving options", serverTop < rootTop)

        composeRule.onNodeWithText("Advanced").performScrollTo().performClick()
        composeRule.onNodeWithText("Run in background").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Keep awake").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Start on boot").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Stop on low battery").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Power diagnostics").performScrollTo().assertIsDisplayed()
    }
}
