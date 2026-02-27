package app.ok200.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import app.ok200.android.viewmodel.ServerViewModel

@Composable
fun ServerScreen(
    viewModel: ServerViewModel,
    onPickFolder: () -> Unit,
    modifier: Modifier = Modifier
) {
    val serverState by viewModel.serverState.collectAsState()
    val port by viewModel.port.collectAsState()
    val rootUri by viewModel.rootUri.collectAsState()
    val rootDisplayName by viewModel.rootDisplayName.collectAsState()
    val localIp by viewModel.localIpAddress.collectAsState()
    val context = LocalContext.current

    var portText by remember(port) { mutableStateOf(port.toString()) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
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
                        onClick = onPickFolder,
                        enabled = !serverState.running
                    ) {
                        Text(if (rootUri != null) "Change" else "Select")
                    }
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
        }
    }
}
