package app.ok200.android.server.storage

import java.io.File
import java.io.FileInputStream
import java.io.InputStream

/** A canonical, containment-checked filesystem serving root. */
class FilesystemFileTree(root: File) : ReadOnlyFileTree {
    private val canonicalRoot = root.canonicalFile
    private val rootPrefix = canonicalRoot.path.trimEnd(File.separatorChar) + File.separator

    init {
        require(canonicalRoot.isDirectory) { "Serving root is not a readable directory" }
    }

    override fun metadata(path: List<String>): TreeEntry? {
        val file = resolve(path) ?: return null
        if (!file.exists()) return null
        return file.toTreeEntry()
    }

    override fun list(path: List<String>): List<TreeEntry>? {
        val directory = resolve(path) ?: return null
        if (!directory.isDirectory) return null
        return directory.listFiles()?.map { it.toTreeEntry() } ?: emptyList()
    }

    override fun open(path: List<String>): InputStream? {
        val file = resolve(path) ?: return null
        if (!file.isFile) return null
        return FileInputStream(file)
    }

    private fun resolve(path: List<String>): File? {
        if (path.any(::isInvalidSegment)) return null
        val candidate = path.fold(canonicalRoot) { parent, segment -> File(parent, segment) }
        val canonical = candidate.canonicalFile
        return if (canonical == canonicalRoot || canonical.path.startsWith(rootPrefix)) canonical else null
    }

    private fun File.toTreeEntry(): TreeEntry = TreeEntry(
        name = name,
        isDirectory = isDirectory,
        size = if (isFile) length() else 0,
        lastModifiedMillis = lastModified()
    )

    private fun isInvalidSegment(segment: String): Boolean =
        segment.isEmpty() || segment == "." || segment == ".." ||
            segment.indexOf('\u0000') >= 0 || segment.indexOf('/') >= 0 ||
            segment.indexOf('\\') >= 0
}
