package app.ok200.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.ok200.android.BuildConfig
import app.ok200.android.server.ServerPhase
import app.ok200.android.settings.WakeLockMode
import app.ok200.android.viewmodel.ServerViewModel
import java.io.File

private const val FEEDBACK_URL = "https://ok200.app/feedback"
private const val SOURCE_URL = "https://github.com/kzahel/web-server-chrome"

@Composable
fun ServerScreen(
    viewModel: ServerViewModel,
    onPickFolder: () -> Unit,
    onRequestAllFilesAccess: () -> Unit,
    onRequestNotificationPermission: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.serverState.collectAsState()
    val configuredPort by viewModel.port.collectAsState()
    val rootUri by viewModel.rootUri.collectAsState()
    val rootDisplayName by viewModel.rootDisplayName.collectAsState()
    val allFilesAccess by viewModel.allFilesAccess.collectAsState()
    val localIp by viewModel.localIpAddress.collectAsState()
    val lanEnabled by viewModel.lanEnabled.collectAsState()
    val directoryListing by viewModel.directoryListing.collectAsState()
    val corsEnabled by viewModel.corsEnabled.collectAsState()
    val spaEnabled by viewModel.spaEnabled.collectAsState()
    val backgroundEnabled by viewModel.backgroundEnabled.collectAsState()
    val wakeLockMode by viewModel.wakeLockMode.collectAsState()
    val startOnBoot by viewModel.startOnBoot.collectAsState()
    val shutdownOnLowBattery by viewModel.shutdownOnLowBattery.collectAsState()
    val shutdownBatteryThreshold by viewModel.shutdownBatteryThreshold.collectAsState()
    val notificationGranted by viewModel.notificationPermissionGranted.collectAsState()
    val powerState by viewModel.powerState.collectAsState()
    val batteryLevel by viewModel.batteryLevel.collectAsState()
    val charging by viewModel.isCharging.collectAsState()
    val dozing by viewModel.isDozing.collectAsState()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current

    var portText by remember(configuredPort) { mutableStateOf(configuredPort.toString()) }
    var showFilePicker by remember { mutableStateOf(false) }
    var broadRootCandidate by remember { mutableStateOf<File?>(null) }
    var advancedExpanded by remember { mutableStateOf(false) }
    val portValue = portText.toIntOrNull()
    val portValid = portValue != null && portValue in 0..65_535
    val busy = state.phase == ServerPhase.STARTING || state.phase == ServerPhase.STOPPING
    val settingsEnabled = !state.running && !busy

    if (showFilePicker) {
        FolderPickerDialog(
            onFolderSelected = { file ->
                when {
                    file.canonicalPath == File.separator -> {
                        Toast.makeText(context, "The Android OS root cannot be served", Toast.LENGTH_LONG).show()
                    }
                    isBroadStorageRoot(file) -> broadRootCandidate = file
                    else -> viewModel.setRootUri(Uri.fromFile(file), file.absolutePath)
                }
                showFilePicker = false
            },
            onDismiss = { showFilePicker = false }
        )
    }

    broadRootCandidate?.let { file ->
        AlertDialog(
            onDismissRequest = { broadRootCandidate = null },
            title = { Text("Serve all shared storage?") },
            text = {
                Text(
                    "Every readable file under ${file.absolutePath} may be reachable from the selected network. " +
                        "Choose a narrower folder unless you intend this exposure."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.setRootUri(Uri.fromFile(file), file.absolutePath)
                        broadRootCandidate = null
                    }
                ) { Text("Use this folder") }
            },
            dismissButton = {
                TextButton(onClick = { broadRootCandidate = null }) { Text("Cancel") }
            }
        )
    }

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                modifier = Modifier
                    .widthIn(max = 720.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Header()

                SectionLabel("Serving folder")
                ElevatedCard(modifier = Modifier.fillMaxWidth().testTag("root-card")) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Folder, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (rootUri == null) "No folder selected" else rootDisplayName,
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                if (rootUri?.scheme == "file") "Filesystem access" else "Android folder access (SAF)",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Button(onClick = onPickFolder, enabled = settingsEnabled) {
                                Text(if (rootUri == null) "Select" else "Change")
                            }
                            if (allFilesAccess) {
                                TextButton(onClick = { showFilePicker = true }, enabled = settingsEnabled) {
                                    Text("Filesystem")
                                }
                            }
                        }
                    }
                }

                SectionLabel("Network")
                OutlinedTextField(
                    value = portText,
                    onValueChange = { value ->
                        if (value.length <= 5 && value.all(Char::isDigit)) {
                            portText = value
                            value.toIntOrNull()?.takeIf { it in 0..65_535 }?.let(viewModel::setPort)
                        }
                    },
                    label = { Text("Port") },
                    supportingText = {
                        Text(if (configuredPort == 0) "0 chooses a free port when started" else "1–65535, or 0 for automatic")
                    },
                    isError = !portValid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    enabled = settingsEnabled,
                    modifier = Modifier.fillMaxWidth().testTag("port-input")
                )
                SettingToggle(
                    title = "Available on local network",
                    description = if (lanEnabled) "Other devices on this network can connect" else "Only this Android device can connect",
                    checked = lanEnabled,
                    onCheckedChange = viewModel::setLanEnabled,
                    enabled = settingsEnabled
                )

                SectionLabel("Serving behavior")
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        CompactToggle("Directory listing", "Show folder contents when no index.html exists", directoryListing, viewModel::setDirectoryListing, settingsEnabled)
                        HorizontalDivider()
                        CompactToggle("CORS", "Allow browser requests from other origins", corsEnabled, viewModel::setCorsEnabled, settingsEnabled)
                        HorizontalDivider()
                        CompactToggle("Single-page app fallback", "Serve the root index.html for missing routes", spaEnabled, viewModel::setSpaEnabled, settingsEnabled)
                    }
                }

                ServerControl(
                    phase = state.phase,
                    error = state.error,
                    canStart = rootUri != null && portValid,
                    onStart = viewModel::startServer,
                    onStop = viewModel::stopServer
                )

                if (state.running && state.port > 0) {
                    val primaryHost = if (lanEnabled) localIp else "127.0.0.1"
                    val primaryUrl = "http://$primaryHost:${state.port}"
                    RunningUrls(
                        primaryUrl = primaryUrl,
                        showLoopback = lanEnabled && primaryHost != "127.0.0.1",
                        onOpen = { uriHandler.openUri(primaryUrl) },
                        onCopy = { copyUrl(context, primaryUrl) }
                    )
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { advancedExpanded = !advancedExpanded }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Advanced", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Storage access, background, power, and boot",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Icon(
                            if (advancedExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = if (advancedExpanded) "Collapse Advanced" else "Expand Advanced"
                        )
                    }
                    AnimatedVisibility(advancedExpanded) {
                        AdvancedSettings(
                            allFilesAccess = allFilesAccess,
                            backgroundEnabled = backgroundEnabled,
                            notificationGranted = notificationGranted,
                            wakeLockMode = wakeLockMode,
                            startOnBoot = startOnBoot,
                            shutdownOnLowBattery = shutdownOnLowBattery,
                            shutdownBatteryThreshold = shutdownBatteryThreshold,
                            batteryLevel = batteryLevel,
                            charging = charging,
                            dozing = dozing,
                            powerState = powerState.name,
                            ignoringBatteryOptimizations = viewModel.isIgnoringBatteryOptimizations(),
                            onManageAllFiles = onRequestAllFilesAccess,
                            onBackgroundChanged = viewModel::setBackgroundEnabled,
                            onNotificationAction = onRequestNotificationPermission,
                            onWakeModeChanged = viewModel::setWakeLockMode,
                            onStartOnBootChanged = viewModel::setStartOnBoot,
                            onLowBatteryChanged = viewModel::setShutdownOnLowBattery,
                            onBatteryThresholdChanged = viewModel::setShutdownBatteryThreshold,
                            onOpenBatterySettings = onOpenBatterySettings
                        )
                    }
                }

                ProjectLinks(onOpen = uriHandler::openUri)
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun Header() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.primary) {
            Text(
                "200",
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.Black
            )
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text("200 OK", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Web Server", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionLabel(value: String) {
    Text(value, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun ServerControl(
    phase: ServerPhase,
    error: String?,
    canStart: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    val running = phase == ServerPhase.RUNNING
    val busy = phase == ServerPhase.STARTING || phase == ServerPhase.STOPPING
    Card(
        modifier = Modifier.fillMaxWidth().testTag("server-status"),
        colors = CardDefaults.cardColors(
            containerColor = if (running) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.PowerSettingsNew, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when (phase) {
                        ServerPhase.STOPPED -> "Server stopped"
                        ServerPhase.STARTING -> "Starting server…"
                        ServerPhase.RUNNING -> "Server running"
                        ServerPhase.STOPPING -> "Stopping server…"
                        ServerPhase.FAILED -> "Server could not start"
                    },
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    error ?: if (running) "Ready for requests" else "Choose a folder and start serving",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Button(
                onClick = if (running) onStop else onStart,
                enabled = !busy && (running || canStart),
                modifier = Modifier.testTag("server-toggle")
            ) { Text(if (running) "Stop" else "Start") }
        }
    }
}

@Composable
private fun RunningUrls(
    primaryUrl: String,
    showLoopback: Boolean,
    onOpen: () -> Unit,
    onCopy: () -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth().testTag("running-url")) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Language, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Server URL", style = MaterialTheme.typography.labelMedium)
                    Text(primaryUrl, style = MaterialTheme.typography.bodyLarge)
                }
                IconButton(onClick = onOpen) { Icon(Icons.Default.OpenInBrowser, "Open URL") }
                IconButton(onClick = onCopy) { Icon(Icons.Default.ContentCopy, "Copy URL") }
            }
            if (showLoopback) {
                Text(
                    "On this device: ${primaryUrl.replaceAfter("//", "127.0.0.1:" + primaryUrl.substringAfterLast(':'))}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun AdvancedSettings(
    allFilesAccess: Boolean,
    backgroundEnabled: Boolean,
    notificationGranted: Boolean,
    wakeLockMode: WakeLockMode,
    startOnBoot: Boolean,
    shutdownOnLowBattery: Boolean,
    shutdownBatteryThreshold: Int,
    batteryLevel: Int,
    charging: Boolean,
    dozing: Boolean,
    powerState: String,
    ignoringBatteryOptimizations: Boolean,
    onManageAllFiles: () -> Unit,
    onBackgroundChanged: (Boolean) -> Unit,
    onNotificationAction: () -> Unit,
    onWakeModeChanged: (WakeLockMode) -> Unit,
    onStartOnBootChanged: (Boolean) -> Unit,
    onLowBatteryChanged: (Boolean) -> Unit,
    onBatteryThresholdChanged: (Int) -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalDivider()
        PermissionRow(
            title = "All files access",
            description = if (allFilesAccess) "Granted — filesystem picker available" else "Optional: serve folders outside the Android picker",
            action = "Manage",
            onClick = onManageAllFiles
        )
        CompactToggle("Run in background", "Use a foreground service after the app is minimized", backgroundEnabled, onBackgroundChanged)
        if (backgroundEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionRow(
                title = "Status notification",
                description = if (notificationGranted) "Notification permission granted" else "Permission not granted; Android still shows foreground-service status",
                action = if (notificationGranted) "Settings" else "Allow",
                onClick = onNotificationAction
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Keep awake", style = MaterialTheme.typography.titleSmall)
            Text("Stronger locks improve availability but use more battery", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                WakeLockMode.entries.forEach { mode ->
                    FilterChip(
                        selected = wakeLockMode == mode,
                        onClick = { onWakeModeChanged(mode) },
                        label = { Text(mode.label) }
                    )
                }
            }
        }
        CompactToggle("Start on boot", "Also enables background mode", startOnBoot, onStartOnBootChanged)
        CompactToggle(
            "Stop on low battery",
            if (shutdownOnLowBattery) "Stop at or below $shutdownBatteryThreshold% when unplugged" else "Protect battery during unattended serving",
            shutdownOnLowBattery,
            onLowBatteryChanged
        )
        if (shutdownOnLowBattery) {
            Column {
                Text("Battery threshold: $shutdownBatteryThreshold%", style = MaterialTheme.typography.bodyMedium)
                Slider(
                    value = shutdownBatteryThreshold.toFloat(),
                    onValueChange = { onBatteryThresholdChanged(it.toInt()) },
                    valueRange = 5f..50f,
                    steps = 8
                )
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Power diagnostics", style = MaterialTheme.typography.titleSmall)
                Text(
                    "${if (batteryLevel >= 0) "$batteryLevel%" else "Battery unknown"} · ${if (charging) "Charging" else "On battery"} · $powerState",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "Doze: ${if (dozing) "active" else "inactive"} · Optimization: ${if (ignoringBatteryOptimizations) "unrestricted" else "managed by Android"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(onClick = onOpenBatterySettings) { Text("Battery optimization settings") }
            }
        }
    }
}

@Composable
private fun PermissionRow(title: String, description: String, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        OutlinedButton(onClick = onClick) { Text(action) }
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
    Card(modifier = Modifier.fillMaxWidth()) {
        CompactToggle(title, description, checked, onCheckedChange, enabled)
    }
}

@Composable
private fun CompactToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@Composable
private fun ProjectLinks(onOpen: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onOpen(FEEDBACK_URL) }, modifier = Modifier.weight(1f)) { Text("Feedback") }
            OutlinedButton(onClick = { onOpen(SOURCE_URL) }, modifier = Modifier.weight(1f)) { Text("Source") }
        }
        Text(
            "200 OK for Android ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
    }
}

private fun isBroadStorageRoot(file: File): Boolean {
    val canonical = runCatching { file.canonicalPath }.getOrDefault(file.absolutePath)
    val external = runCatching { Environment.getExternalStorageDirectory().canonicalPath }.getOrNull()
    return canonical == external || canonical == "/storage"
}

private fun copyUrl(context: Context, url: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Server URL", url))
    Toast.makeText(context, "URL copied", Toast.LENGTH_SHORT).show()
}
