(function() {
    _DEBUG = false
    function HTTPConnection(stream) {
        this.stream = stream
        this.curRequest = null
        this.onRequestCallback = null
        //this.log('new connection')
        this.closed = false
    }

    HTTPConnection.prototype = {
        log: function(msg) {
            console.log(this.stream.sockId,msg)
        },
        tryRead: function() {
            this.stream.readUntil('\r\n\r\n',this.onHeaders.bind(this))
        },
        write: function(data) {
            if (typeof data == 'string') {
                // this is using TextEncoder with utf-8
                var buf = WSC.stringToUint8Array(data).buffer
            } else {
                var buf = data
            }
            this.stream.writeBuffer.add(buf)
            this.stream.tryWrite()
        },
        close: function() {
            console.log('http conn close')
            this.closed = true
            this.stream.close()
        },
        addRequestCallback: function(cb) {
            this.onRequestCallback = cb 
        },
        onHeaders: function(data) {
            // TODO - http headers are Latin1, not ascii...
            var datastr = WSC.arrayBufferToString(data)
            var lines = datastr.split('\r\n')
            var firstline = lines[0]
            var flparts = firstline.split(' ')
            var method = flparts[0]
            var uri = flparts[1]
            var version = flparts[2]

            var headers = WSC.parseHeaders(lines.slice(1,lines.length-2))
            this.curRequest = new WSC.HTTPRequest({headers:headers,
                                           method:method,
                                           uri:uri,
                                           version:version,
                                                   connection:this})
            if (_DEBUG) {
                this.log(this.curRequest.uri)
            }
            if (headers['content-length']) {
                var clen = parseInt(headers['content-length'])
                // TODO -- handle 100 continue..
                if (clen > 0) {
                    console.log('request had content length',clen)
                    this.stream.readBytes(clen, this.onRequestBody.bind(this))
                    return
                } else {
                    this.curRequest.body = null
                }
            }

            if (['GET','HEAD','PUT','OPTIONS'].includes(method)) {
                this.onRequest(this.curRequest)
            } else {
                console.error('how to handle',this.curRequest)
            }
        },
        onRequestBody: function(body) {
            var req = this.curRequest
            var ct = req.headers['content-type']
            var default_charset = 'utf-8'
            if (ct) {
                ct = ct.toLowerCase()
                if (ct.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
                    var charset_i = ct.indexOf('charset=')
                    if (charset_i != -1) {
                        var charset = ct.slice(charset_i + 'charset='.length,
                                               ct.length)
                        console.log('using charset',charset)
                    } else {
                        var charset = default_charset
                    }

                    var bodydata = new TextDecoder(charset).decode(body)
                    var bodyparams = {}
                    var items = bodydata.split('&')
                    for (var i=0; i<items.length; i++) {
                        var kv = items[i].split('=')
                        bodyparams[ decodeURIComponent(kv[0]) ] = decodeURIComponent(kv[1])
                    }
                    req.bodyparams = bodyparams
                }
            }
            this.curRequest.body = body
            this.onRequest(this.curRequest)
        },
        onRequest: function(request) {
            this.onRequestCallback(request)
        }
    }

    WSC.HTTPConnection = HTTPConnection;

})();
