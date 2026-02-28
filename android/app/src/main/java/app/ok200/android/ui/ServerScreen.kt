package app.ok200.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.ok200.android.settings.WakeLockMode
import app.ok200.android.viewmodel.ServerViewModel

@Composable
fun ServerScreen(
    viewModel: ServerViewModel,
    onPickFolder: () -> Unit,
    onRequestAllFilesAccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    val serverState by viewModel.serverState.collectAsState()
    val port by viewModel.port.collectAsState()
    val rootUri by viewModel.rootUri.collectAsState()
    val rootDisplayName by viewModel.rootDisplayName.collectAsState()
    val allFilesAccess by viewModel.allFilesAccess.collectAsState()
    val localIp by viewModel.localIpAddress.collectAsState()
    val backgroundEnabled by viewModel.backgroundEnabled.collectAsState()
    val wakeLockMode by viewModel.wakeLockMode.collectAsState()
    val startOnBoot by viewModel.startOnBoot.collectAsState()
    val shutdownOnLowBattery by viewModel.shutdownOnLowBattery.collectAsState()
    val shutdownBatteryThreshold by viewModel.shutdownBatteryThreshold.collectAsState()
    val context = LocalContext.current

    var portText by remember(port) { mutableStateOf(port.toString()) }
    var showFolderPicker by remember { mutableStateOf(false) }

    if (showFolderPicker) {
        FolderPickerDialog(
            onFolderSelected = { file ->
                val uri = Uri.parse("file://${file.absolutePath}")
                viewModel.setRootUri(uri, file.absolutePath)
                showFolderPicker = false
            },
            onDismiss = { showFolderPicker = false }
        )
    }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Title
            Text(
                text = "200 OK",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary
            )

            Text(
                text = "Web Server",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Folder picker
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Folder,
                        contentDescription = "Folder",
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Serving Directory",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = if (rootUri != null) rootDisplayName else "No folder selected",
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 2
                        )
                    }
                    Button(
                        onClick = {
                            if (allFilesAccess) {
                                showFolderPicker = true
                            } else {
                                onPickFolder()
                            }
                        },
                        enabled = !serverState.running
                    ) {
                        Text(if (rootUri != null) "Change" else "Select")
                    }
                }
            }

            // All files access toggle
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "All files access",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "Allow serving from any folder including Downloads",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = allFilesAccess,
                        onCheckedChange = { onRequestAllFilesAccess() },
                        enabled = !serverState.running
                    )
                }
            }

            // Port configuration
            OutlinedTextField(
                value = portText,
                onValueChange = { newValue ->
                    portText = newValue
                    newValue.toIntOrNull()?.let { p ->
                        if (p in 1..65535) {
                            viewModel.setPort(p)
                        }
                    }
                },
                label = { Text("Port") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                enabled = !serverState.running,
                modifier = Modifier.fillMaxWidth()
            )

            // Server toggle
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (serverState.running) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    }
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = if (serverState.running) "Server On" else "Server Off",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = if (serverState.error != null) {
                                serverState.error!!
                            } else if (serverState.running) {
                                "Toggle to stop"
                            } else if (rootUri == null) {
                                "Select a folder first"
                            } else {
                                "Toggle to start"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (serverState.error != null) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }
                    Switch(
                        checked = serverState.running,
                        onCheckedChange = { checked ->
                            if (checked) {
                                viewModel.startServer()
                            } else {
                                viewModel.stopServer()
                            }
                        },
                        enabled = rootUri != null
                    )
                }
            }

            // Server URL when running
            if (serverState.running && serverState.port > 0) {
                val serverUrl = "http://$localIp:${serverState.port}"
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Server URL",
                                style = MaterialTheme.typography.labelMedium
                            )
                            Text(
                                text = serverUrl,
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        IconButton(onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Server URL", serverUrl))
                            Toast.makeText(context, "URL copied", Toast.LENGTH_SHORT).show()
                        }) {
                            Icon(
                                imageVector = Icons.Default.ContentCopy,
                                contentDescription = "Copy URL"
                            )
                        }
                    }
                }
            }

            // --- Power settings ---

            Spacer(modifier = Modifier.height(8.dp))

            HorizontalDivider()

            Text(
                text = "Power & Background",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )

            // Run in background
            SettingToggle(
                title = "Run in background",
                description = "Keep server running when app is minimized",
                checked = backgroundEnabled,
                onCheckedChange = { viewModel.setBackgroundEnabled(it) }
            )

            // Wake lock mode
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Keep awake",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        text = "Prevent device from sleeping while serving",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        WakeLockMode.entries.forEach { mode ->
                            FilterChip(
                                selected = wakeLockMode == mode,
                                onClick = { viewModel.setWakeLockMode(mode) },
                                label = { Text(mode.label) }
                            )
                        }
                    }
                }
            }

            // Start on boot
            SettingToggle(
                title = "Start on boot",
                description = "Automatically start server when device boots",
                checked = startOnBoot,
                onCheckedChange = { viewModel.setStartOnBoot(it) }
            )

            // Low battery shutdown
            SettingToggle(
                title = "Stop on low battery",
                description = if (shutdownOnLowBattery) {
                    "Stop server when battery drops below ${shutdownBatteryThreshold}%"
                } else {
                    "Stop server when battery is critically low"
                },
                checked = shutdownOnLowBattery,
                onCheckedChange = { viewModel.setShutdownOnLowBattery(it) }
            )

            // Battery threshold slider (only when enabled)
            if (shutdownOnLowBattery) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                ) {
                    Text(
                        text = "Battery threshold: ${shutdownBatteryThreshold}%",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Slider(
                        value = shutdownBatteryThreshold.toFloat(),
                        onValueChange = { viewModel.setShutdownBatteryThreshold(it.toInt()) },
                        valueRange = 5f..50f,
                        steps = 8
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled
            )
        }
    }
}
