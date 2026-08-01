package app.ok200.android.server.storage

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.documentfile.provider.DocumentFile
import java.io.InputStream

/** A read-only Storage Access Framework document tree. */
class SafFileTree(
    context: Context,
    rootUri: Uri
) : ReadOnlyFileTree {
    private val resolver = context.applicationContext.contentResolver
    private val root = requireNotNull(DocumentFile.fromTreeUri(context.applicationContext, rootUri)) {
        "Invalid SAF tree URI"
    }

    init {
        require(root.isDirectory) { "SAF root is not a readable directory" }
    }

    override fun metadata(path: List<String>): TreeEntry? = find(path)?.toTreeEntry()

    override fun list(path: List<String>): List<TreeEntry>? {
        val directory = find(path) ?: return null
        if (!directory.isDirectory) return null
        return directory.listFiles().mapNotNull { child ->
            child.name?.let { child.toTreeEntry(it) }
        }
    }

    override fun open(path: List<String>): InputStream? {
        val document = find(path) ?: return null
        if (!document.isFile) return null
        val descriptor = resolver.openFileDescriptor(document.uri, "r") ?: return null
        return ParcelFileDescriptor.AutoCloseInputStream(descriptor)
    }

    private fun find(path: List<String>): DocumentFile? {
        if (path.any(::isInvalidSegment)) return null
        var current = root
        for (segment in path) {
            current = current.findFile(segment) ?: return null
        }
        return current
    }

    private fun DocumentFile.toTreeEntry(nameOverride: String? = name): TreeEntry = TreeEntry(
        name = nameOverride.orEmpty(),
        isDirectory = isDirectory,
        size = if (isFile) length() else 0,
        lastModifiedMillis = lastModified(),
        mimeType = type
    )

    private fun isInvalidSegment(segment: String): Boolean =
        segment.isEmpty() || segment == "." || segment == ".." ||
            segment.indexOf('\u0000') >= 0 || segment.indexOf('/') >= 0 ||
            segment.indexOf('\\') >= 0
}
