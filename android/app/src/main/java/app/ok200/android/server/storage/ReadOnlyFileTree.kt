package app.ok200.android.server.storage

import java.io.Closeable
import java.io.InputStream

/** Metadata required by the HTTP layer for a file or directory. */
data class TreeEntry(
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val lastModifiedMillis: Long,
    val mimeType: String? = null
)

/**
 * A read-only serving root.
 *
 * Paths are already decoded, validated segments. Implementations must still
 * enforce that traversal and symlink resolution cannot escape their root.
 */
interface ReadOnlyFileTree : Closeable {
    fun metadata(path: List<String>): TreeEntry?

    fun list(path: List<String>): List<TreeEntry>?

    fun open(path: List<String>): InputStream?

    override fun close() = Unit
}
