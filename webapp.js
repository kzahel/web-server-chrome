(function(){
    var sockets = chrome.sockets
    var _DEBUG = false

    function WebApplication(opts) {
        // need to support creating multiple WebApplication...
        if (_DEBUG) {
            console.log('initialize webapp with opts',opts)
        }
        opts = opts || {}
        this.id = Math.random().toString()
        this.opts = opts
        this.handlers = opts.handlers || []
        this.init_handlers()
        
        if (opts.retainstr) {
            // special option to setup a handler
            chrome.fileSystem.restoreEntry( opts.retainstr, function(entry) {
                if (entry) {
                    this.on_entry(entry)

                } else {
                    console.error('error setting up retained entry')
                }
            }.bind(this))
        }
        if (opts.entry) {
            this.on_entry(opts.entry)
        }
        this.host = this.get_host()
        this.port = parseInt(opts.port || 8887)
        this.sockInfo = null
        this.lasterr = null
        this.stopped = false
        this.starting = false
        this.started = false
        this.streams = {}
        this.on_status_change = null
        this.interfaces = []
        this.urls = []
        if (this.port > 65535 || this.port < 1024) {
            var err = 'bad port: ' + this.port
            this.error(err)
        }
        if (_DEBUG) {
            console.log('webapp created',this)
        }
    }

    WebApplication.prototype = {
        on_entry: function(entry) {
            var fs = new WSC.FileSystem(entry)
            this.add_handler(['.*',WSC.DirectoryEntryHandler.bind(null, fs)])
            this.init_handlers()
            if (_DEBUG) {
                console.log('setup handler for entry',entry)
            }
            if (this.opts.optBackground) { this.start() }
        },
        get_host: function() {
            var host
            if (WSC.getchromeversion() >= 44 && this.opts.optAllInterfaces) {
                host = this.opts.host || '0.0.0.0'
            } else {
                host = this.opts.host || '127.0.0.1'
            }
            return host
        },
        add_handler: function(handler) {
            this.handlers.push(handler)
        },
        init_handlers: function() {
            this.handlersMatch = []
            for (var i=0; i<this.handlers.length; i++) {
                var repat = this.handlers[i][0]
                this.handlersMatch.push( [new RegExp(repat), this.handlers[i][1]] )
            }
            this.change()
        },
        change: function() {
            if (this.on_status_change) { this.on_status_change() }
        },
        error: function(data) {
            console.error(data)
            this.lasterr = data
            this.change()
        },
        stop: function(reason) {
            if (! (this.started || this.starting)) {
                this.change()
                return
            }

            this.started = false
            chrome.sockets.tcpServer.disconnect(this.sockInfo.socketId, this.onDisconnect.bind(this))
            for (var key in this.streams) {
                this.streams[key].close()
            }
            this.change()
            // also disconnect any open connections...
        },
        onClose: function(info) {
            var err = chrome.runtime.lastError
            if (err) { console.warn(err) }
            this.stopped = true
            this.started = false
            console.log('tcpserver onclose',info)
        },
        onDisconnect: function(info) {
            var err = chrome.runtime.lastError
            if (err) { console.warn(err) }
            this.stopped = true
            this.started = false
            console.log('tcpserver ondisconnect',info)
            if (this.sockInfo) {
                chrome.sockets.tcpServer.close(this.sockInfo.socketId, this.onClose.bind(this))
            }
        },
        onStreamClose: function(stream) {
            console.assert(stream.sockId)
            delete this.streams[stream.sockId]
        },
        start: function() {
	    this.lasterr = null
            if (_DEBUG) {
                console.log('webapp attempt start with opts',this.opts)
            }
            this.change()
            //if (this.lasterr) { return }
            if (this.starting || this.started) { return }
            this.stopped = false
            this.starting = true
            this.change()

            this.urls = []
            this.urls.push({url:'http://127.0.0.1:' + this.port})

            if (this.opts.optAllInterfaces) {
                chrome.system.network.getNetworkInterfaces( function(result) {
                    console.log('network interfaces',result)
                    if (result) {
                        for (var i=0; i<result.length; i++) {
                            if (result[i].prefixLength < 64) {
                                this.urls.push({url:'http://'+result[i].address+':' + this.port})
                                console.log('found interface address: ' + result[i].address)
                            }
                        }
                    }
                }.bind(this))
            }
            var host = this.get_host()
            sockets.tcpServer.create({name:"listenSocket"},function(sockInfo) {
                this.sockInfo = sockInfo
                sockets.tcpServer.listen(this.sockInfo.socketId,
                                         host,
                                         this.port,
                                         this.onListen.bind(this))
                var lasterr = chrome.runtime.lastError
                if (lasterr) {
                    console.log('lasterr listen',lasterr)
                }
            }.bind(this));
        },
        onListen: function(result) {
            //console.log('onListen',result)
            this.starting = false
            var lasterr = chrome.runtime.lastError
            if (lasterr) {
                this.error({message:lasterr})
            } else if (result < 0) {
                this.error({message:'unable to bind to port',
                            errno:result})
            } else {
                this.started = true
                var host = this.get_host()
                console.log('Listening on','http://'+ host + ':' + this.port)
                this.bindAcceptCallbacks()
                this.change()
            }
        },
        bindAcceptCallbacks: function() {
            sockets.tcpServer.onAcceptError.addListener(this.onAcceptError.bind(this))
            sockets.tcpServer.onAccept.addListener(this.onAccept.bind(this))
        },
        onAcceptError: function(acceptInfo) {
            if (acceptInfo.socketId != this.sockInfo.socketId) { return }
            // need to check against this.socketInfo.socketId
            console.error('accept error',this.sockInfo.socketId,acceptInfo)
            // set unpaused, etc
        },
        onAccept: function(acceptInfo) {
            //console.log('onAccept',acceptInfo,this.sockInfo)
            if (acceptInfo.socketId != this.sockInfo.socketId) { return }
            if (acceptInfo.socketId) {
                //var stream = new IOStream(acceptInfo.socketId)
                var stream = new WSC.IOStream(acceptInfo.clientSocketId)
                this.streams[acceptInfo.clientSocketId] = stream
                stream.addCloseCallback(this.onStreamClose.bind(this))
                var connection = new WSC.HTTPConnection(stream)
                connection.addRequestCallback(this.onRequest.bind(this))
                connection.tryRead()
            }
            if (! this.stopped) {
                //this.doAccept() // new API no longer need to call this
            }
        },
        onRequest: function(request) {
            console.log('Request',request.method, request.uri)

            if (this.opts.auth) {
                var validAuth = false
                var auth = request.headers['authorization']
                if (auth) {
                    if (auth.slice(0,6).toLowerCase() == 'basic ') {
                        var userpass = atob(auth.slice(6,auth.length)).split(':')
                        if (userpass[0] == this.opts.auth.username &&
                            userpass[1] == this.opts.auth.password) {
                            validAuth = true
                        }
                    }
                }

                if (! validAuth) {
                    var handler = new WSC.BaseHandler(request)
                    
                    handler.app = this
                    handler.request = request
                    handler.setHeader("WWW-Authenticate", "Basic")
                    handler.write("", 401)
                    handler.finish()
                    return
                }
            }

            
            for (var i=0; i<this.handlersMatch.length; i++) {
                var re = this.handlersMatch[i][0]
                var reresult = re.exec(request.uri)
                if (reresult) {
                    var cls = this.handlersMatch[i][1]
                    var requestHandler = new cls(request)
                    requestHandler.app = this
                    requestHandler.request = request
                    var handlerMethod = requestHandler[request.method.toLowerCase()]
                    if (handlerMethod) {
                        handlerMethod.apply(requestHandler, reresult.slice(1))
                        return
                    }
                }
            }
            console.error('unhandled request',request)
            // create a default handler...
            var handler = new WSC.BaseHandler(request)
            handler.app = this
            handler.request = request
            handler.write("Unhandled request. Did you select a folder to serve?", 404)
            handler.finish()
        }
    }

    function BaseHandler() {
        this.headersWritten = false
        this.responseHeaders = {}
        this.responseData = []
        this.responseLength = null
    }
    _.extend(BaseHandler.prototype, {
        get_argument: function(key,def) {
            if (this.request.arguments[key] !== undefined) {
                return this.request.arguments[key]
            } else {
                return def
            }
        },
        setHeader: function(k,v) {
            this.responseHeaders[k] = v
        },
        writeHeaders: function(code, callback) {
            if (code === undefined || isNaN(code)) { code = 200 }
            this.headersWritten = true
            var lines = []
            if (code == 200) {
                lines.push('HTTP/1.1 200 OK')
            } else {
                //console.log(this.request.connection.stream.sockId,'response code',code, this.responseLength)
                lines.push('HTTP/1.1 '+ code + ' ' + WSC.HTTPRESPONSES[code])
            }
            if (this.responseHeaders['transfer-encoding'] === 'chunked') {
                // pass
            } else {
                if (_DEBUG) {
                    console.log(this.request.connection.stream.sockId,'response code',code, 'clen',this.responseLength)
                }
                console.assert(typeof this.responseLength == 'number')
                lines.push('content-length: ' + this.responseLength)
            }

            var p = this.request.path.split('.')
            if (p.length > 1 && ! this.isDirectoryListing) {
                var ext = p[p.length-1].toLowerCase()
                var type = WSC.MIMETYPES[ext]
                if (type) {
                    // go ahead and assume utf-8 for text/plain and text/html... (what other types?)
                    // also how do we detect this in general? copy from nginx i guess?
                    /*
Changes with nginx 0.7.9                                         12 Aug 2008

    *) Change: now ngx_http_charset_module works by default with following 
       MIME types: text/html, text/css, text/xml, text/plain, 
       text/vnd.wap.wml, application/x-javascript, and application/rss+xml.
*/
                    var default_types = ['text/html',
                                         'text/xml',
                                         'text/plain',
                                         "text/vnd.wap.wml",
                                         "application/javascript",
                                         "application/rss+xml"]

                    if (_.contains(default_types, type)) {
                        type += '; charset=utf-8'
                    }
                    this.setHeader('content-type',type)
                }
            }

            for (key in this.responseHeaders) {
                lines.push(key +': '+this.responseHeaders[key])
            }
            lines.push('\r\n')
            var headerstr = lines.join('\r\n')
            //console.log('write headers',headerstr)
            this.request.connection.write(headerstr, callback)
        },
        writeChunk: function(data) {
            console.assert( data.byteLength !== undefined )
            var chunkheader = data.byteLength.toString(16) + '\r\n'
            //console.log('write chunk',[chunkheader])
            this.request.connection.write( WSC.str2ab(chunkheader) )
            this.request.connection.write( data )
            this.request.connection.write( WSC.str2ab('\r\n') )
        },
        write: function(data, code, opt_finish) {
            if (typeof data == "string") {
                // using .write directly can be dumb/dangerous. Better to pass explicit array buffers
                console.warn('putting strings into write is not well tested with multi byte characters')
                data = new TextEncoder('utf-8').encode(data).buffer
            }

            console.assert(data.byteLength !== undefined)
            if (code === undefined) { code = 200 }
            this.responseData.push(data)
            this.responseLength += data.byteLength
            // todo - support chunked response?
            if (! this.headersWritten) {
                this.writeHeaders(code)
            }
            for (var i=0; i<this.responseData.length; i++) {
                this.request.connection.write(this.responseData[i])
            }
            this.responseData = []
            if (opt_finish !== false) {
                this.finish()
            }
        },
        finish: function() {
            if (this.beforefinish) { this.beforefinish() }
            this.request.connection.curRequest = null
            if (this.request.isKeepAlive() && ! this.request.connection.stream.remoteclosed) {
                this.request.connection.tryRead()
                if (_DEBUG) {
                    console.log('webapp.finish(keepalive)')
                }
            } else {
                this.request.connection.close()
                if (_DEBUG) {
                    console.log('webapp.finish(close)')
                }
            }
        }
    })

    function FileSystem(entry) {
        this.entry = entry
    }
    _.extend(FileSystem.prototype, {
        getByPath: function(path, callback) {
            if (path == '/') { 
                callback(this.entry)
                return
            }
            var parts = path.split('/')
            var newpath = parts.slice(1,parts.length)
            WSC.recursiveGetEntry(this.entry, newpath, callback)
        }
    })

    WSC.FileSystem = FileSystem
    WSC.BaseHandler = BaseHandler
    WSC.WebApplication = WebApplication

})();

