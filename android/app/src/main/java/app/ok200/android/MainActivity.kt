package app.ok200.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Log
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import app.ok200.android.ui.ServerScreen
import app.ok200.android.ui.theme.Ok200Theme
import app.ok200.android.viewmodel.ServerViewModel

private const val TAG = "MainActivity"

class MainActivity : AppCompatActivity() {

    private val viewModel: ServerViewModel by viewModels()

    private val allFilesAccessLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // User returned from system settings — check if permission was granted
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val granted = Environment.isExternalStorageManager()
            viewModel.setAllFilesAccess(granted)
            Log.i(TAG, "All files access: $granted")
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        viewModel.updateNotificationPermission(granted)
        if (!granted) {
            Log.i(TAG, "Notification permission denied")
        }
    }

    private val notificationSettingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // User returned from notification settings — refresh permission state
        viewModel.refreshNotificationPermission()
    }

    private val folderPickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            // Take persistent permission so we can access this folder across restarts
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
            contentResolver.takePersistableUriPermission(uri, flags)

            // Extract a friendly display name
            val displayName = uri.lastPathSegment?.substringAfterLast(':') ?: uri.toString()
            viewModel.setRootUri(uri, displayName)
            Log.i(TAG, "Folder selected: $displayName ($uri)")
        }
    }

    override fun onStart() {
        super.onStart()
        (application as Ok200Application).serviceLifecycleManager.onActivityStart()
        viewModel.refreshNotificationPermission()
    }

    override fun onStop() {
        super.onStop()
        (application as Ok200Application).serviceLifecycleManager.onActivityStop()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            Ok200Theme {
                Scaffold { innerPadding ->
                    ServerScreen(
                        viewModel = viewModel,
                        onPickFolder = { folderPickerLauncher.launch(null) },
                        onRequestAllFilesAccess = { requestAllFilesAccess() },
                        onRequestNotificationPermission = { requestNotificationPermission() },
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED

            if (granted) {
                // Permission already granted — user is toggling OFF, open notification settings
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                }
                notificationSettingsLauncher.launch(intent)
            } else {
                // Permission not granted — request it
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun requestAllFilesAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                // Already granted — just toggle off
                viewModel.setAllFilesAccess(false)
            } else {
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                allFilesAccessLauncher.launch(intent)
            }
        }
    }
}
