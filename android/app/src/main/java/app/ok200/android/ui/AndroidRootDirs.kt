package app.ok200.android.ui

import androidx.annotation.StringRes
import app.ok200.android.R
import java.io.File

/**
 * Category of an Android root directory.
 *
 * Ordered roughly by user relevance: storage/data first, system internals last.
 */
enum class RootDirCategory {
    /** User-accessible storage volumes (sdcard, storage, mnt) */
    STORAGE,
    /** App data, caches, and databases */
    DATA,
    /** OS and vendor partitions (system, vendor, product, apex, …) */
    SYSTEM,
    /** Configuration files and symlinks (etc, config, linkerconfig) */
    CONFIG,
    /** Kernel virtual filesystems (proc, sys, dev, acct) */
    VIRTUAL,
    /** Boot, init, and debug artifacts */
    BOOT,
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
    @StringRes val descriptionRes: Int,
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
    AndroidRootDir("sdcard", R.string.root_dir_sdcard_description, RootDirCategory.STORAGE),
    AndroidRootDir("storage", R.string.root_dir_storage_description, RootDirCategory.STORAGE),
    AndroidRootDir("mnt", R.string.root_dir_mnt_description, RootDirCategory.STORAGE),

    // ── Data ───────────────────────────────────────────────────────────────
    AndroidRootDir("data", R.string.root_dir_data_description, RootDirCategory.DATA),
    AndroidRootDir("cache", R.string.root_dir_cache_description, RootDirCategory.DATA),
    AndroidRootDir("metadata", R.string.root_dir_metadata_description, RootDirCategory.DATA, minApiLevel = 28),

    // ── System partitions ──────────────────────────────────────────────────
    AndroidRootDir("system", R.string.root_dir_system_description, RootDirCategory.SYSTEM),
    AndroidRootDir("system_ext", R.string.root_dir_system_ext_description, RootDirCategory.SYSTEM, minApiLevel = 30),
    AndroidRootDir("vendor", R.string.root_dir_vendor_description, RootDirCategory.SYSTEM, minApiLevel = 26),
    AndroidRootDir("product", R.string.root_dir_product_description, RootDirCategory.SYSTEM, minApiLevel = 28),
    AndroidRootDir("odm", R.string.root_dir_odm_description, RootDirCategory.SYSTEM, minApiLevel = 29),
    AndroidRootDir("oem", R.string.root_dir_oem_description, RootDirCategory.SYSTEM),
    AndroidRootDir("apex", R.string.root_dir_apex_description, RootDirCategory.SYSTEM, minApiLevel = 29),

    // ── Configuration ──────────────────────────────────────────────────────
    AndroidRootDir("config", R.string.root_dir_config_description, RootDirCategory.CONFIG),
    AndroidRootDir("etc", R.string.root_dir_etc_description, RootDirCategory.CONFIG),
    AndroidRootDir("linkerconfig", R.string.root_dir_linkerconfig_description, RootDirCategory.CONFIG, minApiLevel = 30),

    // ── Virtual filesystems ────────────────────────────────────────────────
    AndroidRootDir("dev", R.string.root_dir_dev_description, RootDirCategory.VIRTUAL),
    AndroidRootDir("proc", R.string.root_dir_proc_description, RootDirCategory.VIRTUAL),
    AndroidRootDir("sys", R.string.root_dir_sys_description, RootDirCategory.VIRTUAL),
    AndroidRootDir("acct", R.string.root_dir_acct_description, RootDirCategory.VIRTUAL),

    // ── Boot / init / debug ────────────────────────────────────────────────
    AndroidRootDir("bin", R.string.root_dir_bin_description, RootDirCategory.BOOT),
    AndroidRootDir("sbin", R.string.root_dir_sbin_description, RootDirCategory.BOOT),
    AndroidRootDir("init", R.string.root_dir_init_description, RootDirCategory.BOOT),
    AndroidRootDir("d", R.string.root_dir_d_description, RootDirCategory.BOOT),
    AndroidRootDir("bugreports", R.string.root_dir_bugreports_description, RootDirCategory.BOOT),
    AndroidRootDir("charger", R.string.root_dir_charger_description, RootDirCategory.BOOT),
    AndroidRootDir("debug_ramdisk", R.string.root_dir_debug_ramdisk_description, RootDirCategory.BOOT, minApiLevel = 30),
    AndroidRootDir("postinstall", R.string.root_dir_postinstall_description, RootDirCategory.BOOT, minApiLevel = 28),
    AndroidRootDir("tmp", R.string.root_dir_tmp_description, RootDirCategory.BOOT),
)

/** Lookup table for root directory metadata by name. */
val ANDROID_ROOT_DIRS_BY_NAME: Map<String, AndroidRootDir> =
    ANDROID_ROOT_DIRS.associateBy { it.name }
