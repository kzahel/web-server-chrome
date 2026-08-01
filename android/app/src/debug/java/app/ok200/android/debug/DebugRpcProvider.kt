package app.ok200.android.debug

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.util.Log
import app.ok200.android.Ok200Application
import app.ok200.android.server.ServerPhase
import app.ok200.android.settings.WakeLockMode
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val TAG = "DebugRpcProvider"

class DebugRpcProvider : ContentProvider() {

    private val app: Ok200Application
        get() = context!!.applicationContext as Ok200Application

    private val settings
        get() = app.settingsStore

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        Log.i(TAG, "RPC call: method=$method arg=$arg")
        val result = try {
            when (method) {
                "ping" -> handlePing()
                "getState" -> handleGetState()
                "setPort" -> handleSetPort(arg)
                "setRootPath" -> handleSetRootPath(arg)
                "startServer" -> handleStartServer()
                "stopServer" -> handleStopServer()
                "getPowerState" -> handleGetPowerState()
                "getSettings" -> handleGetSettings()
                "setWakeLockMode" -> handleSetWakeLockMode(arg)
                "setBackgroundEnabled" -> handleSetBackgroundEnabled(arg)
                "setLanEnabled" -> handleBooleanSetting(arg, "lanEnabled") { settings.lanEnabled = it }
                "setDirectoryListing" -> handleBooleanSetting(arg, "directoryListing") { settings.directoryListing = it }
                "setCorsEnabled" -> handleBooleanSetting(arg, "corsEnabled") { settings.corsEnabled = it }
                "setSpaEnabled" -> handleBooleanSetting(arg, "spaEnabled") { settings.spaEnabled = it }
                "setStartOnBoot" -> handleBooleanSetting(arg, "startOnBoot") {
                    settings.startOnBoot = it
                    if (it) app.serverController.onBackgroundSettingChanged(true)
                }
                "setShutdownOnLowBattery" -> handleBooleanSetting(arg, "shutdownOnLowBattery") {
                    settings.shutdownOnLowBattery = it
                    app.serverController.onPowerSettingsChanged()
                }
                "setShutdownBatteryThreshold" -> handleBatteryThreshold(arg)
                else -> errorJson("Unknown method: $method")
            }
        } catch (e: Exception) {
            Log.e(TAG, "RPC error", e)
            errorJson(e.message ?: "Unknown error")
        }
        return Bundle().apply { putString("result", result) }
    }

    private fun handlePing(): String {
        return """{"ok":true}"""
    }

    private fun handleGetState(): String {
        val state = app.serverController.state.value

        return buildJsonObject {
            put("running", state.running)
            put("phase", state.phase.name.lowercase())
            put("port", if (state.port > 0) state.port else settings.port)
            put("host", state.host)
            put("error", state.error?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rootUri", settings.rootUri?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rootDisplayName", settings.rootDisplayName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("configuredPort", settings.port)
            put("controllerInitialized", true)
        }.toString()
    }

    private fun handleSetPort(arg: String?): String {
        val port = arg?.toIntOrNull()
            ?: return errorJson("Invalid port: $arg")
        if (port !in 0..65535)
            return errorJson("Port out of range: $port")
        settings.port = port
        return """{"ok":true,"port":$port}"""
    }

    private fun handleSetRootPath(arg: String?): String {
        if (arg.isNullOrBlank())
            return errorJson("Path required")
        val uri = Uri.parse("file://$arg")
        val displayName = arg.substringAfterLast('/')
        settings.rootUri = uri.toString()
        settings.rootDisplayName = displayName
        return buildJsonObject {
            put("ok", true)
            put("rootUri", uri.toString())
            put("rootDisplayName", displayName)
        }.toString()
    }

    private fun handleStartServer(): String {
        val rootUri = settings.rootUri
            ?: return errorJson("No root URI configured. Call setRootPath first.")

        Uri.parse(rootUri)
        val controller = app.serverController
        controller.requestStart()

        val finalState = runBlocking {
            withTimeoutOrNull(5_000L) {
                controller.state.first { it.running || it.phase == ServerPhase.FAILED }
            }
        } ?: controller.state.value

        return buildJsonObject {
            put("ok", finalState.running)
            put("running", finalState.running)
            put("port", finalState.port)
            put("host", finalState.host)
            if (finalState.error != null) put("error", finalState.error)
        }.toString()
    }

    private fun handleStopServer(): String {
        val controller = app.serverController
        controller.requestStop()
        val finalState = runBlocking {
            withTimeoutOrNull(5_000L) {
                controller.state.first { it.phase == ServerPhase.STOPPED }
            }
        } ?: controller.state.value
        return buildJsonObject {
            put("ok", !finalState.running)
            put("running", finalState.running)
            put("phase", finalState.phase.name.lowercase())
        }.toString()
    }

    private fun handleGetPowerState(): String {
        return buildJsonObject {
            put("ok", true)
            put("summary", app.dozeMonitor.getDebugSummary())
            put("powerState", app.dozeMonitor.powerState.value.name)
            put("isCharging", app.dozeMonitor.isCharging.value)
            put("isDozing", app.dozeMonitor.isDozing.value)
            put("isScreenOn", app.dozeMonitor.isScreenOn.value)
            put("batteryLevel", app.dozeMonitor.batteryLevel.value)
            put("isPowerSave", app.dozeMonitor.isPowerSave.value)
            put("ignoringBatteryOptimizations", app.dozeMonitor.isIgnoringBatteryOptimizations())
        }.toString()
    }

    private fun handleGetSettings(): String {
        return buildJsonObject {
            put("ok", true)
            put("port", settings.port)
            put("rootUri", settings.rootUri?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rootDisplayName", settings.rootDisplayName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("allFilesAccess", settings.allFilesAccess)
            put("lanEnabled", settings.lanEnabled)
            put("directoryListing", settings.directoryListing)
            put("corsEnabled", settings.corsEnabled)
            put("spaEnabled", settings.spaEnabled)
            put("backgroundEnabled", settings.backgroundEnabled)
            put("wakeLockMode", settings.wakeLockMode.key)
            put("startOnBoot", settings.startOnBoot)
            put("shutdownOnLowBattery", settings.shutdownOnLowBattery)
            put("shutdownBatteryThreshold", settings.shutdownBatteryThreshold)
        }.toString()
    }

    private fun handleSetWakeLockMode(arg: String?): String {
        if (arg.isNullOrBlank())
            return errorJson("Mode required (none, wifi_only, full)")
        val mode = WakeLockMode.fromString(arg)
        app.serverController.updateWakeLockMode(mode)
        return buildJsonObject {
            put("ok", true)
            put("wakeLockMode", mode.key)
        }.toString()
    }

    private fun handleSetBackgroundEnabled(arg: String?): String {
        val enabled = when (arg?.lowercase()) {
            "true", "1", "yes" -> true
            "false", "0", "no" -> false
            else -> return errorJson("Boolean required: $arg")
        }
        app.serverController.onBackgroundSettingChanged(enabled)
        return buildJsonObject {
            put("ok", true)
            put("backgroundEnabled", enabled)
        }.toString()
    }

    private fun handleBooleanSetting(
        arg: String?,
        name: String,
        update: (Boolean) -> Unit
    ): String {
        val enabled = parseBoolean(arg) ?: return errorJson("Boolean required: $arg")
        update(enabled)
        return buildJsonObject {
            put("ok", true)
            put(name, enabled)
        }.toString()
    }

    private fun handleBatteryThreshold(arg: String?): String {
        val threshold = arg?.toIntOrNull()?.takeIf { it in 5..50 }
            ?: return errorJson("Threshold must be 5..50")
        settings.shutdownBatteryThreshold = threshold
        app.serverController.onPowerSettingsChanged()
        return """{"ok":true,"shutdownBatteryThreshold":$threshold}"""
    }

    private fun parseBoolean(value: String?): Boolean? = when (value?.lowercase()) {
        "true", "1", "yes" -> true
        "false", "0", "no" -> false
        else -> null
    }

    private fun errorJson(message: String): String {
        return buildJsonObject {
            put("ok", false)
            put("error", message)
        }.toString()
    }

    override fun onCreate(): Boolean = true
    override fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0
}
