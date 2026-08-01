package app.ok200.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ApplicationMetadataInstrumentedTest {
    @Test
    fun applicationUsesExpectedPackageAndSearchableLabel() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("app.ok200.android", appContext.packageName)
        assertEquals(
            "200 OK Web Server",
            appContext.applicationInfo.loadLabel(appContext.packageManager).toString()
        )
    }

    @Test
    fun applicationIsOk200Application() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertTrue(appContext.applicationContext is Ok200Application)
    }
}
