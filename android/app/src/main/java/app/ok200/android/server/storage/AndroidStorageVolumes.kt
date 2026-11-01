package app.ok200.android.server.storage

import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import java.io.File

data class StorageVolumeShortcut(val label: String, val directory: File)

/** Discover mounted volumes without depending on permission to list /storage. */
fun readableStorageVolumeShortcuts(context: Context): List<StorageVolumeShortcut> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()
    val manager = context.getSystemService(StorageManager::class.java) ?: return emptyList()
    return manager.storageVolumes.mapNotNull { volume ->
        if (volume.isPrimary || volume.state !in setOf(
                Environment.MEDIA_MOUNTED, Environment.MEDIA_MOUNTED_READ_ONLY
            )) return@mapNotNull null
        runCatching {
            val directory = volume.directory?.canonicalFile ?: return@runCatching null
            if (!directory.isDirectory || !directory.canRead()) return@runCatching null
            StorageVolumeShortcut(volume.getDescription(context), directory)
        }.getOrNull()
    }.distinctBy { it.directory.path }
}
