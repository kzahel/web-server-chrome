package app.ok200.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun useAppContext() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("app.ok200.android", appContext.packageName)
    }

    @Test
    fun applicationIsOk200Application() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertTrue(appContext.applicationContext is Ok200Application)
    }

    @Test
    fun mainScreenExposesCoreAndAdvancedControls() {
        composeRule.onNodeWithText("200 OK").assertIsDisplayed()
        composeRule.onNodeWithText("Serving folder").assertIsDisplayed()
        composeRule.onNodeWithTag("server-status").performScrollTo().assertIsDisplayed()

        composeRule.onNodeWithText("Advanced").performScrollTo().performClick()
        composeRule.onNodeWithText("Run in background").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Keep awake").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Start on boot").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Stop on low battery").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Power diagnostics").performScrollTo().assertIsDisplayed()
    }
}
