package app.ok200.android.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class ServerLifetimeModeTest {
    @Test
    fun parsesEveryPersistedModeAndFallsBackToBackground() {
        ServerLifetimeMode.entries.forEach { mode ->
            assertEquals(mode, ServerLifetimeMode.fromString(mode.key))
        }

        assertEquals(ServerLifetimeMode.BACKGROUND, ServerLifetimeMode.fromString("unknown"))
    }

    @Test
    fun defaultsScreenOffAvailabilityToNone() {
        assertEquals(WakeLockMode.NONE, WakeLockMode.DEFAULT)
        assertEquals(WakeLockMode.NONE, WakeLockMode.fromString("unknown"))
    }

    @Test
    fun defaultsCorsToOff() {
        assertEquals(false, DEFAULT_CORS_ENABLED)
    }

    @Test
    fun enforcesReliableNotificationWakeAndBootDependencies() {
        assertEquals(true, ServerLifetimePolicy.modeAvailable(ServerLifetimeMode.APP_OPEN, false))
        assertEquals(true, ServerLifetimePolicy.modeAvailable(ServerLifetimeMode.BACKGROUND, false))
        assertEquals(false, ServerLifetimePolicy.modeAvailable(ServerLifetimeMode.RELIABLE, false))
        assertEquals(true, ServerLifetimePolicy.modeAvailable(ServerLifetimeMode.RELIABLE, true))

        ServerLifetimeMode.entries.forEach { mode ->
            val expected = if (mode == ServerLifetimeMode.RELIABLE) WakeLockMode.FULL else WakeLockMode.NONE
            assertEquals(
                expected,
                ServerLifetimePolicy.effectiveWakeLockMode(mode, true, WakeLockMode.FULL)
            )
        }
        assertEquals(
            WakeLockMode.NONE,
            ServerLifetimePolicy.effectiveWakeLockMode(
                ServerLifetimeMode.RELIABLE,
                false,
                WakeLockMode.FULL
            )
        )
        assertEquals(false, ServerLifetimePolicy.startOnBootAvailable(ServerLifetimeMode.BACKGROUND, true))
        assertEquals(false, ServerLifetimePolicy.startOnBootAvailable(ServerLifetimeMode.RELIABLE, false))
        assertEquals(true, ServerLifetimePolicy.startOnBootAvailable(ServerLifetimeMode.RELIABLE, true))
    }
}
