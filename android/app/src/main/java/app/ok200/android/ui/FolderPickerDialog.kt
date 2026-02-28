package app.ok200.android.ui

import android.os.Environment
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import java.io.File

@Immutable
data class FileEntry(val name: String, val path: String)

// Custom scrollbar modifier that only invalidates its own draw layer,
// not the entire LazyColumn content.
private data class ScrollbarElement(
    val state: androidx.compose.foundation.lazy.LazyListState,
    val totalItems: Int,
    val color: Color,
    val width: Dp = 4.dp,
) : ModifierNodeElement<ScrollbarNode>() {
    override fun create() = ScrollbarNode(state, totalItems, color, width)
    override fun update(node: ScrollbarNode) {
        node.state = state
        node.totalItems = totalItems
        node.color = color
        node.width = width
    }
}

private class ScrollbarNode(
    var state: androidx.compose.foundation.lazy.LazyListState,
    var totalItems: Int,
    var color: Color,
    var width: Dp,
) : DrawModifierNode, Modifier.Node() {
    override fun ContentDrawScope.draw() {
        drawContent()
        if (totalItems > 0 && state.layoutInfo.totalItemsCount > 0) {
            val viewportHeight = size.height
            val firstVisible = state.firstVisibleItemIndex
            val visibleCount = state.layoutInfo.visibleItemsInfo.size
            val thumbHeight = (visibleCount.toFloat() / totalItems * viewportHeight)
                .coerceIn(24.dp.toPx(), viewportHeight)
            val scrollRange = viewportHeight - thumbHeight
            val thumbOffset = if (totalItems > visibleCount) {
                firstVisible.toFloat() / (totalItems - visibleCount) * scrollRange
            } else {
                0f
            }
            drawRect(
                color = color,
                topLeft = Offset(size.width - width.toPx(), thumbOffset),
                size = Size(width.toPx(), thumbHeight),
            )
        }
    }
}

private fun Modifier.scrollbar(
    state: androidx.compose.foundation.lazy.LazyListState,
    totalItems: Int,
    color: Color,
    width: Dp = 4.dp,
): Modifier = this then ScrollbarElement(state, totalItems, color, width)

/** Well-known children for directories where listFiles() returns null due to SELinux. */
private val UNREADABLE_DIR_CHILDREN: Map<String, List<String>> = mapOf(
    "/" to ANDROID_ROOT_DIRS.map { it.name },
    "/storage" to listOf("emulated", "self"),
    "/storage/emulated" to emptyList(), // numeric indices (0, 1, …) are always probed
    "/mnt" to listOf("expand", "media_rw", "pass_through", "runtime", "sdcard", "user"),
    "/data" to listOf("data", "local", "media", "user"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolderPickerDialog(
    onFolderSelected: (File) -> Unit,
    onDismiss: () -> Unit
) {
    val root = File("/")
    var currentDir by remember { mutableStateOf(root) }
    var showHidden by remember { mutableStateOf(false) }
    var showShortcuts by remember { mutableStateOf(false) }
    var showCreateFolder by remember { mutableStateOf(false) }
    // Incremented to force recomposition after creating a folder
    var refreshKey by remember { mutableIntStateOf(0) }

    val shortcuts = remember {
        listOf(
            "External storage" to Environment.getExternalStorageDirectory(),
            "Downloads" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "DCIM" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
            "Documents" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
            "File system root" to root,
        )
    }

    val (subdirs, files) = remember(currentDir, showHidden, refreshKey) {
        val listed = currentDir.listFiles()
        val allEntries = if (listed != null) {
            listed.toList()
        } else {
            // listFiles() returns null when the directory can't be read (SELinux, etc.).
            // Probe well-known children by path plus numeric indices.
            val knownChildren = UNREADABLE_DIR_CHILDREN[currentDir.absolutePath]
                ?: emptyList()
            (knownChildren + (0..9).map { it.toString() })
                .distinct()
                .map { File(currentDir, it) }
                .filter { it.exists() }
        }
        val visible = allEntries.filter { showHidden || !it.name.startsWith(".") }
        val dirs = visible.filter { it.isDirectory }
            .sortedBy { it.name.lowercase() }
            .map { FileEntry(it.name, it.absolutePath) }
        val regularFiles = visible.filter { it.isFile }
            .sortedBy { it.name.lowercase() }
            .map { FileEntry(it.name, it.absolutePath) }
        dirs to regularFiles
    }
    val hasParent = currentDir.absolutePath != "/"
    val isAtRoot = !hasParent

    // Create folder dialog
    if (showCreateFolder) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateFolder = false },
            title = { Text("Create folder") },
            text = {
                OutlinedTextField(
                    value = folderName,
                    onValueChange = { folderName = it },
                    label = { Text("Folder name") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (folderName.isNotBlank()) {
                            val newDir = File(currentDir, folderName.trim())
                            newDir.mkdirs()
                            showCreateFolder = false
                            refreshKey++
                        }
                    },
                    enabled = folderName.isNotBlank()
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolder = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                TopAppBar(
                    navigationIcon = {
                        // Clickable path with chevron — opens shortcuts dropdown
                        Box {
                            Row(
                                modifier = Modifier
                                    .clickable { showShortcuts = !showShortcuts }
                                    .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = if (showShortcuts) {
                                        Icons.Default.KeyboardArrowUp
                                    } else {
                                        Icons.Default.KeyboardArrowDown
                                    },
                                    contentDescription = "Shortcuts"
                                )
                            }
                            DropdownMenu(
                                expanded = showShortcuts,
                                onDismissRequest = { showShortcuts = false }
                            ) {
                                shortcuts.forEach { (label, dir) ->
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            currentDir = dir
                                            showShortcuts = false
                                        }
                                    )
                                }
                            }
                        }
                    },
                    title = {
                        Text(
                            text = currentDir.absolutePath,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.clickable { showShortcuts = !showShortcuts }
                        )
                    },
                    actions = {
                        // Create folder button
                        IconButton(onClick = { showCreateFolder = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Create folder")
                        }
                        // Close button
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Cancel")
                        }
                    }
                )
            },
            bottomBar = {
                Button(
                    onClick = { onFolderSelected(currentDir) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 8.dp)
                ) {
                    Text("Select")
                }
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                // Item count + show hidden toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${subdirs.size} folders, ${files.size} files",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Hidden",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Switch(
                            checked = showHidden,
                            onCheckedChange = { showHidden = it },
                            modifier = Modifier.height(24.dp)
                        )
                    }
                }

                val listState = rememberLazyListState()
                val totalItems = subdirs.size + files.size + (if (hasParent) 1 else 0)
                val scrollbarColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .scrollbar(listState, totalItems, scrollbarColor)
                ) {
                    // ".." parent entry
                    if (hasParent) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        currentDir.parentFile?.let { parent ->
                                            currentDir = parent
                                        }
                                    }
                                    .padding(vertical = 14.dp, horizontal = 16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Folder,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "..",
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }
                    }

                    if (subdirs.isEmpty() && files.isEmpty()) {
                        item {
                            Text(
                                text = "Empty folder",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp)
                            )
                        }
                    }

                    items(
                        subdirs,
                        key = { "d:${it.name}" },
                        contentType = { "dir" }
                    ) { dir ->
                        val meta = if (isAtRoot) ANDROID_ROOT_DIRS_BY_NAME[dir.name] else null
                        val isSystem = meta != null && !meta.isUserContent
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { currentDir = File(dir.path) }
                                .padding(vertical = 14.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Folder,
                                contentDescription = null,
                                tint = if (isSystem) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = dir.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (meta != null) {
                                    Text(
                                        text = meta.description,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }

                    items(
                        files,
                        key = { "f:${it.name}" },
                        contentType = { "file" }
                    ) { file ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.InsertDriveFile,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = file.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }
        }
    }
}
