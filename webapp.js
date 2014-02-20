(function(){
    var socket = chrome.socket

    function WebApplication(opts) {
        this.opts = opts
        this.handlers = opts.handlers
        this.handlersMatch = []

        for (var i=0; i<this.handlers.length; i++) {
            var repat = this.handlers[i][0]
            this.handlersMatch.push( [new RegExp(repat), this.handlers[i][1]] )
        }

        this.host = opts.host || '127.0.0.1'
        this.port = opts.port
        this.sockInfo = null
        this.lasterr = null
    }

    WebApplication.prototype = {
        error: function(data) {
            console.error(data)
            this.lasterr = data
        },
        start: function() {
            socket.create("tcp", {}, function(sockInfo) {
                this.sockInfo = sockInfo
                socket.listen(this.sockInfo.socketId,
                              this.host,
                              this.port,
                              function(result) {
                                  if (result < 0) {
                                      this.error({message:'unable to bind to port',
                                                  errno:result})
                                  } else {
                                      console.log('listen result',result)
                                      this.doAccept()
                                  }
                              }.bind(this))
            }.bind(this));
        },
        doAccept: function() {
            socket.accept(this.sockInfo.socketId, this.onAccept.bind(this));
        },
        onAccept: function(acceptInfo) {
            //console.log('onAccept',acceptInfo);
            if (acceptInfo.socketId) {
                var stream = new IOStream(acceptInfo.socketId)
                var connection = new HTTPConnection(stream)
                connection.addRequestCallback(this.onRequest.bind(this))
                connection.tryRead()
            }
            this.doAccept()
        },
        onRequest: function(request) {
            //console.log('webapp handle req',request)
            for (var i=0; i<this.handlersMatch.length; i++) {
                var re = this.handlersMatch[i][0]
                var reresult = re.exec(request.uri)
                if (reresult) {
                    var cls = this.handlersMatch[i][1]
                    var requestHandler = new cls()
                    requestHandler.request = request
                    requestHandler[request.method.toLowerCase()](reresult.slice(1))
                    return
                }
            }
            console.error('unhandled request',request)
            
        }
    }

    function BaseHandler() {
        this.headersWritten = false
        this.responseData = []
        this.responseLength = 0
    }
    _.extend(BaseHandler.prototype, {
        get_argument: function(key,def) {
            if (this.request.arguments[key] !== undefined) {
                return this.request.arguments[key]
            } else {
                return def
            }
        },
        getHeaders: function() {
            // guess content type...
            var lines = []
            var mime = {'html': 'text/html',
                        'js': 'application/javascript'}
            var parts = this.request.path.split('.')
            var ext = parts[parts.length-1]
            if (mime[ext]) {
                lines.push('content-type: '+ mime[ext])
            }


/*
            lines.push('accept-ranges: bytes')
            if (this.request.headers['range']) {
                debugger
                if (this.request.headers['range'] == 'bytes 0-') {
                    var cr = 'content-range: bytes 0-' + this.responseLength-1 + '/' + this.responseLength
                    this.fileLength = this.responseLength
                } else {
                    var cr = 'content-range: ' + this.request.headers['range'] + '/' + this.fileLength
                }
                debugger
                lines.push(cr)
            }
*/
            return lines
        },
        writeHeaders: function(code, dheaders) {
            this.headersWritten = true
            var lines = []
            if (code == 200) {
                lines.push('HTTP/1.1 200 OK')
            } else {
                lines.push('HTTP/1.1 '+ code + ' Eat me')
            }
            lines.push('content-length: ' + this.responseLength)

            if (dheaders) {
                for (key in dheaders) {
                    // dont set certain headers...

                    lines.push(key +': '+dheaders[key])
                }
            }

            //lines = lines.concat(this.getHeaders())

            lines.push('\r\n')

            this.request.connection.write(lines.join('\r\n'))
        },
        writeResponse: function(resp) {
            var lines = resp.headers.split('\r\n')
            var dheaders = parseHeaders(lines.slice(0,lines.length-1))
            this.responseLength = (resp.data.length || resp.data.byteLength)
            this.writeHeaders(200, dheaders)
            this.write(resp.data)
            
        },
        write: function(data, code) {
            if (code === undefined) { code = 200 }
            this.responseData.push(data)
            this.responseLength += (data.length || data.byteLength)
            // todo - support chunked response?
            if (! this.headersWritten) {
                this.writeHeaders(code)
            }
            for (var i=0; i<this.responseData.length; i++) {
                this.request.connection.write(this.responseData[i])
            }
            this.responseData = []
            this.finish()
        },
        finish: function() {
            this.request.connection.curRequest = null
            if (this.request.isKeepAlive()) {
                this.request.connection.tryRead()
            }
        }
    })

    function haveentry(entry) {
        window.fs = new FileSystem(entry)
    }
    window.haveentry = haveentry

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
            recursiveGetEntry(this.entry, newpath, callback)
        }
    })

    function DirectoryEntryHandler() {
        BaseHandler.prototype.constructor.call(this)
    }
    _.extend(DirectoryEntryHandler.prototype, {
        get: function() {
            if (! window.fs) {
                this.write("error: need to select a directory to serve",500)
                return
            }
            //var path = decodeURI(this.request.path)
            fs.getByPath(this.request.path, this.onEntry.bind(this))

        },
        onEntry: function(entry) {
            if (entry.error) {
                this.write('not found',404)
            } else if (entry.isFile) {
                entry.file( function(file) {
                    console.log(entry,file)
                    var fr = new FileReader
                    var cb = this.onReadEntry.bind(this)
                    fr.onload = cb
                    fr.onerror = cb
                    fr.readAsArrayBuffer(file)
                }.bind(this))
            } else {
                // directory
                var reader = entry.createReader()
                reader.readEntries( function(results) {
                    this.renderDirectoryListing(results)
                }.bind(this))
            }
        },
        renderDirectoryListing: function(results) {
            var html = ['<html>']
            html.push('<style>li.directory {background:#aab}</style>')
            html.push('<a href="..">parent</a>')
            html.push('<ul>')

            for (var i=0; i<results.length; i++) {
                if (results[i].isDirectory) {
                    html.push('<li class="directory"><a href="' + results[i].name + '/">' + results[i].name + '</a></li>')
                } else {
                    html.push('<li><a href="' + results[i].name + '">' + results[i].name + '</a></li>')
                }
            }
            html.push('</ul></html>')
            this.write(html.join('\n'))
        },
        onReadEntry: function(evt) {
            // set mime types etc?
            this.write(evt.target.result)

        }
    }, BaseHandler.prototype)


    function PackageFilesHandler() {
        // this thing is ASS
        BaseHandler.prototype.constructor.call(this)
    }
    _.extend(PackageFilesHandler.prototype, {

        get: function() {

            // how does this handle streaming and cancel and all that?
            // not so good my guess...

            var uri = this.request.uri

            var xhr = new XMLHttpRequest();
            function stateChange(evt) {
                if (evt.target.readyState == 4) {
                    if (evt.target.status == 200) {
                        var resp = {data:evt.target.response,
                                    size:evt.target.response.byteLength,
                                    headers:evt.target.getAllResponseHeaders(),
                                    type:evt.target.getResponseHeader('content-type')
                                   }
                        this.writeResponse(resp)
                    } else {
                        //console.error('error in passthru package files',evt)
                        this.write('error', 404)
                    }
                }
            }
            xhr.onreadystatechange = stateChange.bind(this)
            if (this.request.headers['range']) {
                console.log('request had range',this.request)
            }
            xhr.open("GET", uri, true);
            for (key in this.request.headers) {

                if (key == 'connection' ||
                    key == 'host' ||
                    key == 'cookie' ||
                    key == 'accept-encoding' ||
                    key == 'user-agent' ||
                    key == 'referer') {
                } else {
                    //console.log('set req header',key)
                    xhr.setRequestHeader(key, this.request.headers[key])
                }
            }
            xhr.responseType = 'arraybuffer';
            xhr.send();
        }

    }, BaseHandler.prototype)

    window.PackageFilesHandler = PackageFilesHandler
    window.DirectoryEntryHandler = DirectoryEntryHandler
    window.BaseHandler = BaseHandler
    chrome.WebApplication = WebApplication

})();