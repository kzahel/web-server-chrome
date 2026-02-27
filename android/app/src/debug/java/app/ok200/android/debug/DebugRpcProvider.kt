package app.ok200.android.debug

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import app.ok200.android.Ok200Application
import app.ok200.android.service.WebServerService
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val TAG = "DebugRpcProvider"
private const val PREFS_NAME = "ok200_prefs"
private const val KEY_PORT = "port"
private const val KEY_ROOT_URI = "root_uri"
private const val KEY_ROOT_DISPLAY = "root_display"

class DebugRpcProvider : ContentProvider() {

    private val app: Ok200Application
        get() = context!!.applicationContext as Ok200Application

    private val prefs by lazy {
        context!!.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }

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
        val controller = app.engineController
        val state = controller?.state?.value
        val port = prefs.getInt(KEY_PORT, 8080)
        val rootUri = prefs.getString(KEY_ROOT_URI, null)
        val rootDisplay = prefs.getString(KEY_ROOT_DISPLAY, null)

        return buildJsonObject {
            put("running", state?.running ?: false)
            put("port", state?.port ?: port)
            put("host", state?.host ?: "")
            put("error", state?.error?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rootUri", rootUri?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rootDisplayName", rootDisplay?.let { JsonPrimitive(it) } ?: JsonNull)
            put("configuredPort", port)
            put("engineInitialized", controller != null)
        }.toString()
    }

    private fun handleSetPort(arg: String?): String {
        val port = arg?.toIntOrNull()
            ?: return errorJson("Invalid port: $arg")
        if (port !in 1..65535)
            return errorJson("Port out of range: $port")
        prefs.edit().putInt(KEY_PORT, port).apply()
        return """{"ok":true,"port":$port}"""
    }

    private fun handleSetRootPath(arg: String?): String {
        if (arg.isNullOrBlank())
            return errorJson("Path required")
        val uri = Uri.parse("file://$arg")
        val displayName = arg.substringAfterLast('/')
        app.servingRootUri = uri
        prefs.edit()
            .putString(KEY_ROOT_URI, uri.toString())
            .putString(KEY_ROOT_DISPLAY, displayName)
            .apply()
        return buildJsonObject {
            put("ok", true)
            put("rootUri", uri.toString())
            put("rootDisplayName", displayName)
        }.toString()
    }

    private fun handleStartServer(): String {
        val rootUri = prefs.getString(KEY_ROOT_URI, null)
            ?: return errorJson("No root URI configured. Call setRootPath first.")

        app.servingRootUri = Uri.parse(rootUri)
        val port = prefs.getInt(KEY_PORT, 8080)

        val controller = app.initializeEngine()
        controller.startServer(port, "0.0.0.0")

        // Start foreground service on main thread
        mainHandler.post {
            val intent = Intent(context, WebServerService::class.java)
            context!!.startForegroundService(intent)
        }

        // Wait briefly for state to reflect "running"
        val finalState = runBlocking {
            withTimeoutOrNull(3000L) {
                controller.state.first { it.running || it.error != null }
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
        app.engineController?.stopServer()

        // Stop foreground service on main thread
        mainHandler.post {
            val intent = Intent(context, WebServerService::class.java)
            context!!.stopService(intent)
        }

        return """{"ok":true}"""
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
