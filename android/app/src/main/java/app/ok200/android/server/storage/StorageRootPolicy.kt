package app.ok200.android.server.storage

/** Presentation policy for canonical Android storage paths; this does not grant access. */
object StorageRootPolicy {
    fun requiresBroadRootConfirmation(canonicalPath: String, primaryStoragePath: String?): Boolean {
        if (canonicalPath == primaryStoragePath || canonicalPath == "/storage") return true

        // Removable volumes are mounted directly under /storage. Include unknown
        // volume names in the disclosure rather than depending on a UUID format.
        val volume = canonicalPath.removePrefix("/storage/")
        return canonicalPath.startsWith("/storage/") && volume.isNotEmpty() &&
            '/' !in volume && volume != "emulated" && volume != "self"
    }
}
