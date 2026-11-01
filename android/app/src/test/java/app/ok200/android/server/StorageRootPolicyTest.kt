package app.ok200.android.server

import app.ok200.android.server.storage.StorageRootPolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StorageRootPolicyTest {
    @Test
    fun confirmsPrimaryAndRemovableVolumeRootsWithoutRestrictingSubfolders() {
        val primary = "/storage/emulated/0"
        listOf(primary, "/storage", "/storage/ABCD-1234", "/storage/portable-card").forEach {
            assertTrue(it, StorageRootPolicy.requiresBroadRootConfirmation(it, primary))
        }
        listOf(
            "/storage/emulated", "/storage/self", "/storage/ABCD-1234/site",
            "$primary/site", "/data/user/0/app.ok200.android/files"
        ).forEach {
            assertFalse(it, StorageRootPolicy.requiresBroadRootConfirmation(it, primary))
        }
    }
}
