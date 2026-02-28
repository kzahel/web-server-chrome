package app.ok200.android.ui

import java.io.File

/**
 * Category of an Android root directory.
 *
 * Ordered roughly by user relevance: storage/data first, system internals last.
 */
enum class RootDirCategory(val label: String) {
    /** User-accessible storage volumes (sdcard, storage, mnt) */
    STORAGE("storage"),
    /** App data, caches, and databases */
    DATA("data"),
    /** OS and vendor partitions (system, vendor, product, apex, …) */
    SYSTEM("system"),
    /** Configuration files and symlinks (etc, config, linkerconfig) */
    CONFIG("config"),
    /** Kernel virtual filesystems (proc, sys, dev, acct) */
    VIRTUAL("virtual"),
    /** Boot, init, and debug artifacts */
    BOOT("boot"),
}

/**
 * Metadata for a well-known Android root-level directory.
 *
 * Used as a fallback when `File("/").listFiles()` returns null (SELinux denial on
 * non-rooted devices), and as a source of rich UI information for file-explorer UIs.
 */
data class AndroidRootDir(
    /** Directory name under "/" (e.g. "sdcard", "system") */
    val name: String,
    /** Short human-readable description */
    val description: String,
    /** High-level category */
    val category: RootDirCategory,
    /**
     * Minimum Android API level where this directory is expected to exist.
     * null means present since early Android versions.
     */
    val minApiLevel: Int? = null,
) {
    /** True for directories that typically contain user-accessible content. */
    val isUserContent: Boolean get() = category == RootDirCategory.STORAGE || category == RootDirCategory.DATA
}

/**
 * Comprehensive list of well-known directories at the Android root filesystem ("/").
 *
 * Sources:
 * - AOSP init.rc  (platform/system/core/rootdir/init.rc)
 * - Android partition layout docs  (source.android.com/docs/core/architecture/partitions)
 * - Empirical `adb shell ls /` across Android 8–15
 *
 * This list is intentionally broad. Callers should filter with [File.exists] at runtime
 * since the actual set varies by device, OEM, and Android version.
 */
val ANDROID_ROOT_DIRS: List<AndroidRootDir> = listOf(
    // ── Storage (user-accessible content) ──────────────────────────────────
    AndroidRootDir("sdcard", "Primary shared storage (/storage/emulated/0)", RootDirCategory.STORAGE),
    AndroidRootDir("storage", "Internal and external storage volumes", RootDirCategory.STORAGE),
    AndroidRootDir("mnt", "Mount points for media, USB, and OBB", RootDirCategory.STORAGE),

    // ── Data ───────────────────────────────────────────────────────────────
    AndroidRootDir("data", "App installs, user data, and databases", RootDirCategory.DATA),
    AndroidRootDir("cache", "Temporary cached data (absent on A/B devices)", RootDirCategory.DATA),
    AndroidRootDir("metadata", "Metadata encryption partition", RootDirCategory.DATA, minApiLevel = 28),

    // ── System partitions ──────────────────────────────────────────────────
    AndroidRootDir("system", "Core Android OS and pre-installed apps", RootDirCategory.SYSTEM),
    AndroidRootDir("system_ext", "Extensions to the system partition", RootDirCategory.SYSTEM, minApiLevel = 30),
    AndroidRootDir("vendor", "Hardware-specific binaries (Project Treble)", RootDirCategory.SYSTEM, minApiLevel = 26),
    AndroidRootDir("product", "Product/SKU-specific customizations", RootDirCategory.SYSTEM, minApiLevel = 28),
    AndroidRootDir("odm", "Original Device Manufacturer partition", RootDirCategory.SYSTEM, minApiLevel = 29),
    AndroidRootDir("oem", "OEM-specific customizations (legacy)", RootDirCategory.SYSTEM),
    AndroidRootDir("apex", "Updatable system modules (Project Mainline)", RootDirCategory.SYSTEM, minApiLevel = 29),

    // ── Configuration ──────────────────────────────────────────────────────
    AndroidRootDir("config", "Kernel configfs", RootDirCategory.CONFIG),
    AndroidRootDir("etc", "Configuration files (symlink to /system/etc)", RootDirCategory.CONFIG),
    AndroidRootDir("linkerconfig", "Dynamic linker namespace configuration", RootDirCategory.CONFIG, minApiLevel = 30),

    // ── Virtual filesystems ────────────────────────────────────────────────
    AndroidRootDir("dev", "Device nodes (tmpfs)", RootDirCategory.VIRTUAL),
    AndroidRootDir("proc", "Kernel and process information (procfs)", RootDirCategory.VIRTUAL),
    AndroidRootDir("sys", "Kernel device/driver model (sysfs)", RootDirCategory.VIRTUAL),
    AndroidRootDir("acct", "Process accounting (cgroup)", RootDirCategory.VIRTUAL),

    // ── Boot / init / debug ────────────────────────────────────────────────
    AndroidRootDir("bin", "Essential command binaries", RootDirCategory.BOOT),
    AndroidRootDir("sbin", "System binaries (restricted)", RootDirCategory.BOOT),
    AndroidRootDir("init", "Init process binary and configs", RootDirCategory.BOOT),
    AndroidRootDir("d", "Symlink to /sys/kernel/debug (debugfs)", RootDirCategory.BOOT),
    AndroidRootDir("bugreports", "Symlink for bug report generation", RootDirCategory.BOOT),
    AndroidRootDir("charger", "Off-mode charging resources", RootDirCategory.BOOT),
    AndroidRootDir("debug_ramdisk", "Debug-mode ramdisk", RootDirCategory.BOOT, minApiLevel = 30),
    AndroidRootDir("postinstall", "OTA post-install staging", RootDirCategory.BOOT, minApiLevel = 28),
    AndroidRootDir("tmp", "Temporary files (tmpfs)", RootDirCategory.BOOT),
)

/** Lookup table for root directory metadata by name. */
val ANDROID_ROOT_DIRS_BY_NAME: Map<String, AndroidRootDir> =
    ANDROID_ROOT_DIRS.associateBy { it.name }
