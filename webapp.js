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
            console.log('onAccept',acceptInfo);
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
        writeHeaders: function() {
            var lines = []
            lines.push('HTTP/1.1 200 OK')
            lines.push('content-length: ' + this.responseLength)
            lines.push('\r\n')

            this.request.connection.write(lines.join('\r\n'))
        },
        write: function(data) {
            this.responseData.push(data)
            this.responseLength += (data.length || data.byteLength)
            // todo - support chunked response?
            if (! this.headersWritten) {
                this.headersWritten = true
                this.writeHeaders()
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


    function PackageFilesHandler() {
        BaseHandler.prototype.constructor.call(this)
    }
    _.extend(PackageFilesHandler.prototype, {

        get: function() {
            var uri = this.request.uri

            var xhr = new XMLHttpRequest();
            function stateChange(evt) {
                if (evt.target.readyState == 4) {
                    if (evt.target.status == 200) {
                        var resp = {data:evt.target.response,
                                    size:evt.target.response.byteLength,
                                    type:evt.target.getResponseHeader('content-type')
                                   }
                        this.write(evt.target.response)
                    } else {
                        console.error('error in passthru package files',evt)
                        this.write('error')
                    }
                  
                }
            }
            xhr.onreadystatechange = stateChange.bind(this)
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
    window.BaseHandler = BaseHandler
    chrome.WebApplication = WebApplication

})();