package app.ok200.quickjs.bindings

import android.net.Uri
import app.ok200.io.file.FileManager
import app.ok200.io.socket.TcpSocketService
import app.ok200.quickjs.JsThread
import app.ok200.quickjs.QuickJsContext
import kotlinx.coroutines.CoroutineScope

/**
 * Native bindings facade for QuickJS.
 *
 * Registers all __ok200_* functions on a QuickJsContext, enabling
 * the TypeScript engine to perform I/O operations via the native layer.
 */
class NativeBindings(
    jsThread: JsThread,
    scope: CoroutineScope,
    fileManager: FileManager,
    rootUriProvider: () -> Uri?
) {
    private val tcpService = TcpSocketService(scope)

    private val polyfillBindings = PolyfillBindings(jsThread)
    private val tcpBindings = TcpBindings(jsThread, tcpService)
    private val tcpServerBindings = TcpServerBindings(jsThread, tcpService)
    private val fileBindings = FileBindings(fileManager, rootUriProvider)
    private val callbackBindings = CallbackBindings()

    var stateListener: EngineStateListener?
        get() = callbackBindings.stateListener
        set(value) { callbackBindings.stateListener = value }

    var errorListener: EngineErrorListener?
        get() = callbackBindings.errorListener
        set(value) { callbackBindings.errorListener = value }

    /**
     * Register all native bindings on the given context.
     * Must be called on the JS thread.
     */
    fun registerAll(ctx: QuickJsContext) {
        polyfillBindings.register(ctx)
        tcpBindings.register(ctx)
        tcpServerBindings.register(ctx)
        fileBindings.register(ctx)
        callbackBindings.register(ctx)

        registerTimerDispatcher(ctx)
        registerTcpDispatchers(ctx)
    }

    fun shutdown() {
        tcpService.shutdown()
    }

    /**
     * Set up TCP event dispatch from I/O threads to JS.
     * The TcpSocketService callbacks post to JS thread, then we dispatch here.
     */
    fun setupEventDispatching(ctx: QuickJsContext) {
        // Override the TcpSocketCallback to dispatch via context
        tcpService.setCallback(object : app.ok200.io.socket.TcpSocketCallback {
            override fun onTcpData(socketId: Int, data: ByteArray) {
                tcpBindings.jsThread.post {
                    tcpBindings.dispatchData(ctx, socketId, data)
                }
            }
            override fun onTcpClose(socketId: Int, hadError: Boolean) {
                tcpBindings.jsThread.post {
                    tcpBindings.dispatchClose(ctx, socketId, hadError)
                }
            }
            override fun onTcpError(socketId: Int, message: String) {
                tcpBindings.jsThread.post {
                    tcpBindings.dispatchError(ctx, socketId, message)
                }
            }
        })

        tcpService.setCallback(object : app.ok200.io.socket.TcpServerCallback {
            override fun onTcpListenResult(serverId: Int, success: Boolean, boundPort: Int, errorCode: String?) {
                tcpServerBindings.jsThread.post {
                    tcpServerBindings.dispatchListening(ctx, serverId, success, boundPort)
                }
            }
            override fun onTcpAccepted(serverId: Int, socketId: Int, peerAddr: String, peerPort: Int) {
                tcpServerBindings.jsThread.post {
                    tcpServerBindings.dispatchAccept(ctx, serverId, socketId, peerAddr, peerPort)
                }
            }
        })
    }

    private fun registerTimerDispatcher(ctx: QuickJsContext) {
        ctx.evaluate("""
            (function() {
                globalThis.__ok200_timer_callbacks = new Map();
                globalThis.__ok200_timer_next_id = 1;

                globalThis.__ok200_timer_dispatch = function(callbackId) {
                    const id = parseInt(callbackId);
                    const callback = globalThis.__ok200_timer_callbacks.get(id);
                    if (callback) {
                        if (callback.once) {
                            globalThis.__ok200_timer_callbacks.delete(id);
                        }
                        callback.fn();
                    }
                };

                const origSetTimeout = globalThis.__ok200_set_timeout;
                globalThis.__ok200_set_timeout = function(callback, ms) {
                    const callbackId = globalThis.__ok200_timer_next_id++;
                    globalThis.__ok200_timer_callbacks.set(callbackId, { fn: callback, once: true });
                    return origSetTimeout(callbackId, ms);
                };

                const origClearTimeout = globalThis.__ok200_clear_timeout;
                globalThis.__ok200_clear_timeout = function(timerId) {
                    globalThis.__ok200_timer_callbacks.delete(timerId);
                    origClearTimeout(timerId);
                };

                const origSetInterval = globalThis.__ok200_set_interval;
                globalThis.__ok200_set_interval = function(callback, ms) {
                    const callbackId = globalThis.__ok200_timer_next_id++;
                    globalThis.__ok200_timer_callbacks.set(callbackId, { fn: callback, once: false });
                    return origSetInterval(callbackId, ms);
                };

                const origClearInterval = globalThis.__ok200_clear_interval;
                globalThis.__ok200_clear_interval = function(intervalId) {
                    globalThis.__ok200_timer_callbacks.delete(intervalId);
                    origClearInterval(intervalId);
                };
            })();
        """.trimIndent(), "timer-dispatcher.js")
    }

    private fun registerTcpDispatchers(ctx: QuickJsContext) {
        ctx.evaluate("""
            (function() {
                globalThis.__ok200_tcp_callbacks = {
                    onData: null,
                    onClose: null,
                    onError: null,
                    onListening: null,
                    onAccept: null
                };

                const origOnData = globalThis.__ok200_tcp_on_data;
                globalThis.__ok200_tcp_on_data = function(callback) {
                    globalThis.__ok200_tcp_callbacks.onData = callback;
                    origOnData(callback);
                };

                const origOnClose = globalThis.__ok200_tcp_on_close;
                globalThis.__ok200_tcp_on_close = function(callback) {
                    globalThis.__ok200_tcp_callbacks.onClose = callback;
                    origOnClose(callback);
                };

                const origOnError = globalThis.__ok200_tcp_on_error;
                globalThis.__ok200_tcp_on_error = function(callback) {
                    globalThis.__ok200_tcp_callbacks.onError = callback;
                    origOnError(callback);
                };

                const origOnListening = globalThis.__ok200_tcp_on_listening;
                globalThis.__ok200_tcp_on_listening = function(callback) {
                    globalThis.__ok200_tcp_callbacks.onListening = callback;
                    origOnListening(callback);
                };

                const origOnAccept = globalThis.__ok200_tcp_on_accept;
                globalThis.__ok200_tcp_on_accept = function(callback) {
                    globalThis.__ok200_tcp_callbacks.onAccept = callback;
                    origOnAccept(callback);
                };

                // Dispatchers called by Kotlin
                globalThis.__ok200_tcp_dispatch_data = function(socketId, data) {
                    const callback = globalThis.__ok200_tcp_callbacks.onData;
                    if (callback) {
                        callback(parseInt(socketId), data);
                    }
                };

                globalThis.__ok200_tcp_dispatch_accept = function(serverId, socketId, remoteAddr, remotePort) {
                    const callback = globalThis.__ok200_tcp_callbacks.onAccept;
                    if (callback) {
                        callback(parseInt(serverId), parseInt(socketId), remoteAddr, parseInt(remotePort));
                    }
                };

                globalThis.__ok200_tcp_dispatch_close = function(socketId, hadError) {
                    const callback = globalThis.__ok200_tcp_callbacks.onClose;
                    if (callback) {
                        callback(parseInt(socketId), hadError === 'true');
                    }
                };

                globalThis.__ok200_tcp_dispatch_error = function(socketId, message) {
                    const callback = globalThis.__ok200_tcp_callbacks.onError;
                    if (callback) {
                        callback(parseInt(socketId), message);
                    }
                };

                globalThis.__ok200_tcp_dispatch_listening = function(serverId, success, port) {
                    const callback = globalThis.__ok200_tcp_callbacks.onListening;
                    if (callback) {
                        callback(parseInt(serverId), success === 'true', parseInt(port));
                    }
                };

            })();
        """.trimIndent(), "tcp-dispatcher.js")
    }

    // Expose jsThread for TcpBindings' dispatch methods
    private val TcpBindings.jsThread get() = this@NativeBindings.let {
        // Access via reflection-free path — TcpBindings has jsThread in constructor
        val field = TcpBindings::class.java.getDeclaredField("jsThread")
        field.isAccessible = true
        field.get(this) as JsThread
    }

    private val TcpServerBindings.jsThread get() = this@NativeBindings.let {
        val field = TcpServerBindings::class.java.getDeclaredField("jsThread")
        field.isAccessible = true
        field.get(this) as JsThread
    }
}
