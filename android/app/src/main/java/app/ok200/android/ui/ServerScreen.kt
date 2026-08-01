package app.ok200.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.text.BidiFormatter
import androidx.core.text.TextDirectionHeuristicsCompat
import app.ok200.android.BuildConfig
import app.ok200.android.R
import app.ok200.android.network.NetworkAddressFamily
import app.ok200.android.power.DozeMonitor.PowerState
import app.ok200.android.server.ServerPhase
import app.ok200.android.settings.ServerLifetimeMode
import app.ok200.android.settings.WakeLockMode
import app.ok200.android.viewmodel.ServerViewModel
import java.io.File
import kotlinx.coroutines.launch

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
    val networkAddresses by viewModel.networkAddresses.collectAsState()
    val lanEnabled by viewModel.lanEnabled.collectAsState()
    val directoryListing by viewModel.directoryListing.collectAsState()
    val corsEnabled by viewModel.corsEnabled.collectAsState()
    val spaEnabled by viewModel.spaEnabled.collectAsState()
    val lifetimeMode by viewModel.lifetimeMode.collectAsState()
    val wakeLockMode by viewModel.wakeLockMode.collectAsState()
    val startOnBoot by viewModel.startOnBoot.collectAsState()
    val shutdownOnLowBattery by viewModel.shutdownOnLowBattery.collectAsState()
    val shutdownBatteryThreshold by viewModel.shutdownBatteryThreshold.collectAsState()
    val notificationGranted by viewModel.notificationPermissionGranted.collectAsState()
    val uiMessage by viewModel.uiMessage.collectAsState()
    val powerState by viewModel.powerState.collectAsState()
    val batteryLevel by viewModel.batteryLevel.collectAsState()
    val charging by viewModel.isCharging.collectAsState()
    val dozing by viewModel.isDozing.collectAsState()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val settingsLockedMessage = stringResource(R.string.settings_locked_message)
    val stopServerAction = stringResource(R.string.action_stop_server)
    val androidRootError = stringResource(R.string.error_android_root_cannot_be_served)

    var portText by remember(configuredPort) { mutableStateOf(configuredPort.toString()) }
    var showFilePicker by remember { mutableStateOf(false) }
    var broadRootCandidate by remember { mutableStateOf<File?>(null) }
    var advancedExpanded by remember { mutableStateOf(false) }
    val portValue = portText.toIntOrNull()
    val portValid = portValue != null && portValue in 0..65_535
    val busy = state.phase == ServerPhase.STARTING || state.phase == ServerPhase.STOPPING
    val settingsEnabled = !state.running && !busy
    val lifetimeReady = lifetimeMode != ServerLifetimeMode.RELIABLE || notificationGranted
    val onLockedSettingsTap: () -> Unit = {
        coroutineScope.launch {
            val result = snackbarHostState.showSnackbar(
                message = settingsLockedMessage,
                actionLabel = stopServerAction,
                withDismissAction = true
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.stopServer()
            }
        }
    }

    LaunchedEffect(uiMessage) {
        val message = uiMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message = message, withDismissAction = true)
        viewModel.clearUiMessage()
    }

    if (showFilePicker) {
        FolderPickerDialog(
            onFolderSelected = { file ->
                when {
                    file.canonicalPath == File.separator -> {
                        Toast.makeText(context, androidRootError, Toast.LENGTH_LONG).show()
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
            title = { Text(stringResource(R.string.dialog_serve_all_storage_title)) },
            text = {
                Text(
                    stringResource(R.string.dialog_serve_all_storage_message, file.absolutePath)
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.setRootUri(Uri.fromFile(file), file.absolutePath)
                        broadRootCandidate = null
                    }
                ) { Text(stringResource(R.string.action_use_this_folder)) }
            },
            dismissButton = {
                TextButton(onClick = { broadRootCandidate = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
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

                ServerControl(
                    phase = state.phase,
                    error = state.error,
                    canStart = rootUri != null && portValid && lifetimeReady,
                    blockedReason = when {
                        rootUri == null -> stringResource(R.string.server_blocked_choose_folder)
                        !portValid -> stringResource(R.string.server_blocked_invalid_port)
                        !lifetimeReady -> stringResource(R.string.server_blocked_enable_notifications)
                        else -> null
                    },
                    onStart = viewModel::startServer,
                    onStop = viewModel::stopServer
                )

                if (state.running && state.port > 0) {
                    val loopbackUrl = "http://127.0.0.1:${state.port}"
                    val runningUrls = if (lanEnabled) {
                        networkAddresses
                            .filter { it.usableFromAnotherDevice }
                            .map { address ->
                                RunningUrl(address.httpUrl(state.port), address.family)
                            }
                    } else {
                        listOf(RunningUrl(loopbackUrl, family = null))
                    }
                    RunningUrls(
                        urls = runningUrls,
                        lanEnabled = lanEnabled,
                        chromeOsIpv4Port = state.port.takeIf { lanEnabled && viewModel.isChromeOs },
                        showIpv4Unavailable = lanEnabled && !viewModel.isChromeOs &&
                            runningUrls.none { it.family == NetworkAddressFamily.IPV4 },
                        loopbackUrl = loopbackUrl.takeIf { lanEnabled },
                        onOpen = uriHandler::openUri,
                        onCopy = { url -> copyUrl(context, url) }
                    )
                }

                ServerSettingsHeader(locked = !settingsEnabled)
                LockedSettingsContainer(
                    locked = !settingsEnabled,
                    onLockedClick = onLockedSettingsTap
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        SectionLabel(stringResource(R.string.section_serving_folder))
                        ElevatedCard(modifier = Modifier.fillMaxWidth().testTag("root-card")) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Folder, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        if (rootUri == null) {
                                            stringResource(R.string.folder_none_selected)
                                        } else {
                                            rootDisplayName
                                        },
                                        style = MaterialTheme.typography.titleMedium,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        if (rootUri?.scheme == "file") {
                                            stringResource(R.string.folder_access_direct)
                                        } else {
                                            stringResource(R.string.folder_access_android)
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Button(onClick = onPickFolder, enabled = settingsEnabled) {
                                        Text(
                                            stringResource(
                                                if (rootUri == null) R.string.action_select else R.string.action_change
                                            )
                                        )
                                    }
                                    if (allFilesAccess) {
                                        TextButton(onClick = { showFilePicker = true }, enabled = settingsEnabled) {
                                            Text(stringResource(R.string.folder_action_filesystem))
                                        }
                                    }
                                }
                            }
                        }

                        SectionLabel(stringResource(R.string.section_network))
                        OutlinedTextField(
                            value = portText,
                            onValueChange = { value ->
                                if (value.length <= 5 && value.all(Char::isDigit)) {
                                    portText = value
                                    value.toIntOrNull()?.takeIf { it in 0..65_535 }?.let(viewModel::setPort)
                                }
                            },
                            label = { Text(stringResource(R.string.setting_port)) },
                            supportingText = {
                                Text(
                                    stringResource(
                                        if (configuredPort == 0) {
                                            R.string.setting_port_automatic_active
                                        } else {
                                            R.string.setting_port_help
                                        }
                                    )
                                )
                            },
                            isError = !portValid,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            enabled = settingsEnabled,
                            modifier = Modifier.fillMaxWidth().testTag("port-input")
                        )
                        SettingToggle(
                            title = stringResource(R.string.setting_lan_title),
                            description = stringResource(
                                if (lanEnabled) {
                                    R.string.setting_lan_enabled_description
                                } else {
                                    R.string.setting_lan_disabled_description
                                }
                            ),
                            checked = lanEnabled,
                            onCheckedChange = viewModel::setLanEnabled,
                            enabled = settingsEnabled
                        )

                        SectionLabel(stringResource(R.string.section_serving_behavior))
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column {
                                CompactToggle(
                                    stringResource(R.string.setting_directory_listing_title),
                                    stringResource(R.string.setting_directory_listing_description),
                                    directoryListing,
                                    viewModel::setDirectoryListing,
                                    settingsEnabled
                                )
                                HorizontalDivider()
                                CompactToggle(
                                    stringResource(R.string.setting_cors_title),
                                    stringResource(R.string.setting_cors_description),
                                    corsEnabled,
                                    viewModel::setCorsEnabled,
                                    settingsEnabled
                                )
                                HorizontalDivider()
                                CompactToggle(
                                    stringResource(R.string.setting_spa_title),
                                    stringResource(R.string.setting_spa_description),
                                    spaEnabled,
                                    viewModel::setSpaEnabled,
                                    settingsEnabled
                                )
                            }
                        }
                    }
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
                            Text(stringResource(R.string.advanced_title), style = MaterialTheme.typography.titleMedium)
                            Text(
                                stringResource(R.string.advanced_description),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Icon(
                            if (advancedExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = stringResource(
                                if (advancedExpanded) {
                                    R.string.accessibility_collapse_advanced
                                } else {
                                    R.string.accessibility_expand_advanced
                                }
                            )
                        )
                    }
                    AnimatedVisibility(advancedExpanded) {
                        AdvancedSettings(
                            allFilesAccess = allFilesAccess,
                            lifetimeMode = lifetimeMode,
                            notificationGranted = notificationGranted,
                            wakeLockMode = wakeLockMode,
                            startOnBoot = startOnBoot,
                            shutdownOnLowBattery = shutdownOnLowBattery,
                            shutdownBatteryThreshold = shutdownBatteryThreshold,
                            batteryLevel = batteryLevel,
                            charging = charging,
                            dozing = dozing,
                            powerState = powerState,
                            ignoringBatteryOptimizations = viewModel.isIgnoringBatteryOptimizations(),
                            onManageAllFiles = onRequestAllFilesAccess,
                            onLifetimeModeChanged = { mode ->
                                if (viewModel.setLifetimeMode(mode)) onRequestNotificationPermission()
                            },
                            onNotificationAction = onRequestNotificationPermission,
                            onWakeModeChanged = viewModel::setWakeLockMode,
                            onStartOnBootChanged = { enabled ->
                                if (viewModel.setStartOnBoot(enabled)) onRequestNotificationPermission()
                            },
                            onLowBatteryChanged = viewModel::setShutdownOnLowBattery,
                            onBatteryThresholdChanged = viewModel::setShutdownBatteryThreshold,
                            onOpenBatterySettings = onOpenBatterySettings
                        )
                    }
                }

                ProjectLinks(onOpen = uriHandler::openUri)
                Spacer(Modifier.height(12.dp))
            }
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp)
            )
        }
    }
}

@Composable
private fun Header() {
    val brandName = BidiFormatter.getInstance().unicodeWrap(
        stringResource(R.string.brand_name),
        TextDirectionHeuristicsCompat.LTR
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Image(
            painter = painterResource(R.mipmap.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(56.dp).clip(CircleShape).testTag("app-logo")
        )
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                brandName,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("brand-name")
            )
            Text(stringResource(R.string.web_server), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionLabel(value: String) {
    Text(value, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun ServerSettingsHeader(locked: Boolean) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("server-settings-header"),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            stringResource(R.string.server_settings_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            if (locked) {
                stringResource(R.string.server_settings_locked_description)
            } else {
                stringResource(R.string.server_settings_description)
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (locked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
internal fun LockedSettingsContainer(
    locked: Boolean,
    onLockedClick: () -> Unit,
    content: @Composable () -> Unit
) {
    val lockedDescription = stringResource(R.string.accessibility_server_settings_locked)
    Box(Modifier.fillMaxWidth()) {
        content()
        if (locked) {
            val interactionSource = remember { MutableInteractionSource() }
            Box(
                Modifier
                    .matchParentSize()
                    .clickable(
                        interactionSource = interactionSource,
                        indication = null,
                        onClick = onLockedClick
                    )
                    .testTag("locked-settings-overlay")
                    .semantics {
                        contentDescription = lockedDescription
                    }
            )
        }
    }
}

@Composable
private fun ServerControl(
    phase: ServerPhase,
    error: String?,
    canStart: Boolean,
    blockedReason: String?,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    val running = phase == ServerPhase.RUNNING
    val busy = phase == ServerPhase.STARTING || phase == ServerPhase.STOPPING
    val switchOn = running || phase == ServerPhase.STARTING
    val status = when (phase) {
        ServerPhase.STOPPED -> stringResource(R.string.server_status_stopped)
        ServerPhase.STARTING -> stringResource(R.string.server_status_starting)
        ServerPhase.RUNNING -> stringResource(R.string.server_status_running)
        ServerPhase.STOPPING -> stringResource(R.string.server_status_stopping)
        ServerPhase.FAILED -> stringResource(R.string.server_status_error)
    }
    val detail = error ?: when {
        running -> stringResource(R.string.server_detail_ready_for_requests)
        busy -> stringResource(R.string.server_detail_please_wait)
        !canStart -> blockedReason ?: stringResource(R.string.server_detail_complete_settings)
        else -> stringResource(R.string.server_detail_ready_to_start)
    }
    val switchDescription = stringResource(
        if (running) R.string.accessibility_stop_web_server else R.string.accessibility_start_web_server
    )
    ElevatedCard(
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
                Text(stringResource(R.string.server_control_title), style = MaterialTheme.typography.titleMedium)
                Text(status, style = MaterialTheme.typography.labelLarge)
                Text(
                    detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(
                checked = switchOn,
                onCheckedChange = { enabled -> if (enabled) onStart() else onStop() },
                enabled = !busy && (running || canStart),
                modifier = Modifier
                    .testTag("server-toggle")
                    .semantics {
                        contentDescription = switchDescription
                    }
            )
        }
    }
}

private data class RunningUrl(
    val value: String,
    val family: NetworkAddressFamily?
)

@Composable
private fun RunningUrls(
    urls: List<RunningUrl>,
    lanEnabled: Boolean,
    chromeOsIpv4Port: Int?,
    showIpv4Unavailable: Boolean,
    loopbackUrl: String?,
    onOpen: (String) -> Unit,
    onCopy: (String) -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth().testTag("running-url")) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Language, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(
                    stringResource(
                        if (lanEnabled) R.string.url_network_http_only else R.string.url_device_http_only
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.weight(1f)
                )
            }

            urls.forEachIndexed { index, url ->
                if (index > 0) HorizontalDivider()
                val addressLabel = when (url.family) {
                    NetworkAddressFamily.IPV4 -> stringResource(R.string.url_ipv4_label)
                    NetworkAddressFamily.IPV6 -> stringResource(R.string.url_ipv6_label)
                    null -> stringResource(R.string.url_device_label)
                }
                val addressTag = when (url.family) {
                    NetworkAddressFamily.IPV4 -> "server-url-ipv4"
                    NetworkAddressFamily.IPV6 -> "server-url-ipv6"
                    null -> "server-url-device"
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        addressLabel,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = { onOpen(url.value) }) {
                        Icon(
                            Icons.Default.OpenInBrowser,
                            stringResource(R.string.accessibility_open_url)
                        )
                    }
                    IconButton(onClick = { onCopy(url.value) }) {
                        Icon(
                            Icons.Default.ContentCopy,
                            stringResource(R.string.accessibility_copy_url)
                        )
                    }
                }
                Text(
                    url.value,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpen(url.value) }
                        .testTag(addressTag)
                )
            }

            if (urls.isNotEmpty()) {
                Text(
                    stringResource(R.string.url_http_only_help),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            chromeOsIpv4Port?.let { port ->
                HorizontalDivider()
                Column(
                    modifier = Modifier.testTag("chromeos-ipv4-help"),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        stringResource(R.string.url_chromeos_ipv4_title),
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(
                        stringResource(R.string.url_chromeos_ipv4_help, port),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        stringResource(R.string.url_chromeos_ipv4_example, port),
                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                    )
                }
            }

            if (showIpv4Unavailable) {
                Text(
                    stringResource(R.string.url_ipv4_unavailable),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("ipv4-unavailable")
                )
            }

            loopbackUrl?.let { url ->
                Text(
                    stringResource(R.string.url_on_this_device, url),
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
    lifetimeMode: ServerLifetimeMode,
    notificationGranted: Boolean,
    wakeLockMode: WakeLockMode,
    startOnBoot: Boolean,
    shutdownOnLowBattery: Boolean,
    shutdownBatteryThreshold: Int,
    batteryLevel: Int,
    charging: Boolean,
    dozing: Boolean,
    powerState: PowerState,
    ignoringBatteryOptimizations: Boolean,
    onManageAllFiles: () -> Unit,
    onLifetimeModeChanged: (ServerLifetimeMode) -> Unit,
    onNotificationAction: () -> Unit,
    onWakeModeChanged: (WakeLockMode) -> Unit,
    onStartOnBootChanged: (Boolean) -> Unit,
    onLowBatteryChanged: (Boolean) -> Unit,
    onBatteryThresholdChanged: (Int) -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    val reliableReady = lifetimeMode == ServerLifetimeMode.RELIABLE && notificationGranted
    Column(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        HorizontalDivider()
        AdvancedSectionHeader(stringResource(R.string.advanced_storage_access_title))
        PermissionRow(
            title = stringResource(R.string.setting_all_files_access_title),
            description = stringResource(
                if (allFilesAccess) {
                    R.string.setting_all_files_access_granted
                } else {
                    R.string.setting_all_files_access_optional
                }
            ),
            action = stringResource(R.string.action_manage),
            onClick = onManageAllFiles
        )

        HorizontalDivider()
        AdvancedSectionHeader(
            title = stringResource(R.string.advanced_server_lifetime_title),
            description = stringResource(R.string.advanced_server_lifetime_description)
        )
        ServerLifetimeMode.entries.forEachIndexed { index, mode ->
            if (index > 0) HorizontalDivider()
            LifetimeOption(
                title = stringResource(mode.labelRes),
                description = when (mode) {
                    ServerLifetimeMode.APP_OPEN -> stringResource(R.string.lifetime_app_open_description)
                    ServerLifetimeMode.BACKGROUND -> stringResource(R.string.lifetime_background_description)
                    ServerLifetimeMode.RELIABLE -> stringResource(R.string.lifetime_reliable_description)
                },
                selected = lifetimeMode == mode,
                onClick = { onLifetimeModeChanged(mode) }
            )
        }
        if (lifetimeMode == ServerLifetimeMode.RELIABLE && !notificationGranted) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.notifications_required),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = onNotificationAction) {
                    Text(stringResource(R.string.action_enable))
                }
            }
        }

        HorizontalDivider()
        AdvancedSectionHeader(
            title = stringResource(R.string.advanced_screen_off_title),
            description = if (reliableReady) {
                stringResource(R.string.advanced_screen_off_ready_description)
            } else {
                stringResource(R.string.advanced_screen_off_unavailable_description)
            }
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WakeLockMode.entries.forEach { mode ->
                FilterChip(
                    selected = wakeLockMode == mode,
                    onClick = { onWakeModeChanged(mode) },
                    enabled = reliableReady,
                    label = { Text(stringResource(mode.labelRes)) }
                )
            }
        }
        Text(
            if (!reliableReady) {
                stringResource(R.string.wake_lock_inactive_description)
            } else {
                when (wakeLockMode) {
                    WakeLockMode.NONE -> stringResource(R.string.wake_lock_off_description)
                    WakeLockMode.WIFI_ONLY -> stringResource(R.string.wake_lock_wifi_description)
                    WakeLockMode.FULL -> stringResource(R.string.wake_lock_full_description)
                }
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        HorizontalDivider()
        AdvancedSectionHeader(stringResource(R.string.advanced_automation_title))
        AdvancedToggle(
            title = stringResource(R.string.setting_start_on_boot_title),
            description = if (reliableReady) {
                stringResource(R.string.setting_start_on_boot_ready_description)
            } else {
                stringResource(R.string.setting_start_on_boot_unavailable_description)
            },
            checked = startOnBoot,
            onCheckedChange = onStartOnBootChanged
        )
        AdvancedToggle(
            title = stringResource(R.string.setting_low_battery_title),
            description = if (shutdownOnLowBattery) {
                stringResource(
                    R.string.setting_low_battery_enabled_description,
                    shutdownBatteryThreshold
                )
            } else {
                stringResource(R.string.setting_low_battery_description)
            },
            checked = shutdownOnLowBattery,
            onCheckedChange = onLowBatteryChanged
        )
        if (shutdownOnLowBattery) {
            Column(Modifier.padding(start = 8.dp)) {
                Text(
                    stringResource(R.string.setting_battery_threshold, shutdownBatteryThreshold),
                    style = MaterialTheme.typography.bodyMedium
                )
                Slider(
                    value = shutdownBatteryThreshold.toFloat(),
                    onValueChange = { onBatteryThresholdChanged(it.toInt()) },
                    valueRange = 5f..50f,
                    steps = 8
                )
            }
        }

        HorizontalDivider()
        AdvancedSectionHeader(stringResource(R.string.advanced_power_diagnostics_title))
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val batteryText = if (batteryLevel >= 0) {
                    stringResource(R.string.battery_level_percent, batteryLevel)
                } else {
                    stringResource(R.string.battery_unknown)
                }
                val chargingText = stringResource(
                    if (charging) R.string.battery_charging else R.string.battery_on_battery
                )
                val powerStateText = stringResource(
                    when (powerState) {
                        PowerState.Active -> R.string.power_state_active
                        PowerState.ScreenOff -> R.string.power_state_screen_off
                        PowerState.Dozing -> R.string.power_state_dozing
                        PowerState.Charging -> R.string.power_state_charging
                        PowerState.ChargingButDozing -> R.string.power_state_charging_dozing
                    }
                )
                Text(
                    stringResource(
                        R.string.power_diagnostics_summary,
                        batteryText,
                        chargingText,
                        powerStateText
                    ),
                    style = MaterialTheme.typography.bodySmall
                )
                val dozeText = stringResource(
                    if (dozing) R.string.doze_active else R.string.doze_inactive
                )
                val optimizationText = stringResource(
                    if (ignoringBatteryOptimizations) {
                        R.string.optimization_unrestricted
                    } else {
                        R.string.optimization_managed
                    }
                )
                Text(
                    stringResource(R.string.power_diagnostics_details, dozeText, optimizationText),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(onClick = onOpenBatterySettings) {
                    Text(stringResource(R.string.action_battery_optimization_settings))
                }
            }
        }
    }
}

@Composable
private fun AdvancedSectionHeader(title: String, description: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary
        )
        if (description != null) {
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun AdvancedToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun LifetimeOption(
    title: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PermissionRow(
    title: String,
    description: String,
    action: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
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
            OutlinedButton(onClick = { onOpen(FEEDBACK_URL) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.action_feedback))
            }
            OutlinedButton(onClick = { onOpen(SOURCE_URL) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.action_source))
            }
        }
        Text(
            stringResource(R.string.project_version, BuildConfig.VERSION_NAME),
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
    clipboard.setPrimaryClip(
        ClipData.newPlainText(context.getString(R.string.clipboard_server_url_label), url)
    )
    Toast.makeText(context, context.getString(R.string.toast_http_url_copied), Toast.LENGTH_SHORT).show()
}
