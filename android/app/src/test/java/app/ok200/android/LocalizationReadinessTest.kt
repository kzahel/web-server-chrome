package app.ok200.android

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalizationReadinessTest {
    @Test
    fun userFacingAndroidSurfacesDoNotIntroduceHardCodedCopy() {
        val sourceRoot = locateMainSourceRoot()
        val guardedFiles = listOf(
            "app/ok200/android/Ok200Application.kt",
            "app/ok200/android/server/AndroidServerController.kt",
            "app/ok200/android/server/storage/SafFileTree.kt",
            "app/ok200/android/service/WebServerService.kt",
            "app/ok200/android/settings/SettingsStore.kt",
            "app/ok200/android/ui/AndroidRootDirs.kt",
            "app/ok200/android/ui/FolderPickerDialog.kt",
            "app/ok200/android/ui/ServerScreen.kt",
            "app/ok200/android/viewmodel/ServerViewModel.kt",
        )
        val forbidden = listOf(
            Regex("""Text\s*\(\s*\""""),
            Regex("""contentDescription\s*=\s*\""""),
            Regex("""(?:title|description|action|message|actionLabel)\s*=\s*\""""),
            Regex("""(?:SectionLabel|AdvancedSectionHeader|CompactToggle)\s*\(\s*\""""),
            Regex("""Toast\.makeText\([^\n]*,\s*\""""),
            Regex("""\.setContentTitle\(\s*\""""),
            Regex("""\.addAction\([^,]+,\s*\""""),
        )

        val violations = guardedFiles.flatMap { relativePath ->
            val file = File(sourceRoot, relativePath)
            assertTrue("Missing guarded source file: $file", file.isFile)
            val source = file.readText()
            forbidden.mapNotNull { pattern ->
                pattern.find(source)?.let { "$relativePath matched ${pattern.pattern}" }
            }
        }

        assertTrue(
            "User-facing Android copy must use string resources:\n${violations.joinToString("\n")}",
            violations.isEmpty()
        )
    }

    private fun locateMainSourceRoot(): File {
        val candidates = listOf(
            File("src/main/java"),
            File("app/src/main/java"),
            File("android/app/src/main/java"),
        )
        return candidates.firstOrNull(File::isDirectory)
            ?: error("Unable to locate Android main source root from ${File(".").absolutePath}")
    }
}
