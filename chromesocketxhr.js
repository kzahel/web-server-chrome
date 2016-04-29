(function() {
    function ui8IndexOf(arr, s, startIndex) {
        // searches a ui8array for subarray s starting at startIndex
        startIndex = startIndex || 0
        var match = false
        for (var i=startIndex; i<arr.length - s.length + 1; i++) {
            if (arr[i] == s[0]) {
                match = true
                for (var j=1; j<s.length; j++) {
                    if (arr[i+j] != s[j]) {
                        match = false
                        break
                    }
                }
                if (match) {
                    return i
                }
            }
        }
        return -1
    }


    function ChromeSocketXMLHttpRequest() {
        this.onload = null
        this._finished = false
        this.onerror = null
        this.opts = null

        this.timedOut = false
        this.timeout = 0
        this.timeoutId = null

        this.stream = null
        
        this.connecting = false
        this.writing = false
        this.haderror = false
        this.closed = false

        this.sockInfo = null
        this.responseType = null

        this.extraHeaders = {}

        this.headersReceived = false
        this.responseHeaders = null
        this.responseHeadersParsed = null
        this.responseBody = null
        this.responseLength = null
        this.responseBytesRead = null
        this.requestBody = null

        this.secured = false
    }

    ChromeSocketXMLHttpRequest.prototype = {
        open: function(method, url, async) {
            this.opts = { method:method,
                          url:url,
                          async:true }
            this.uri = WSC.parseUri(this.opts.url)
            //console.assert(this.uri.protocol == 'http:') // https not supported for chrome.socket yet
        },
        setRequestHeader: function(key, val) {
            this.extraHeaders[key] = val
        },
        cancel: function() {
            if (! this.stream.closed) { this.stream.close() }
        },
        send: function(data) {
            //console.log('xhr send payload',this.opts.method, data)
            this.requestBody = data
            chrome.sockets.tcp.create({}, _.bind(this.onCreate, this))
            if (this.timeout !== 0) {
                this.timeoutId = setTimeout( _.bind(this.checkTimeout, this), this.timeout )
            }
        },
        createRequestHeaders: function() {
            var lines = []
            var headers = {//'Connection': 'close',
                           //'Accept-Encoding': 'identity', // servers will send us chunked encoding even if we dont want it, bastards
//                           'Accept-Encoding': 'identity;q=1.0 *;q=0', // servers will send us chunked encoding even if we dont want it, bastards
                           //                       'User-Agent': 'uTorrent/330B(30235)(server)(30235)', // setRequestHeader /extra header is doing this
                           'Host': this.uri.host}
            _.extend(headers, this.extraHeaders)
            if (this.opts.method == 'GET') {
                //                headers['Content-Length'] == '0'
            } else if (this.opts.method == 'POST') {
                if (this.requestBody) {
                    headers['Content-Length'] = this.requestBody.byteLength.toString()
                } else {
                    headers['Content-Length'] = '0'
                    // make sure content-length 0 included ?
                }
            } else {
                this.error('unsupported method')
            }
            lines.push(this.opts.method + ' ' + this.uri.pathname + this.uri.search + ' HTTP/1.1')
            //console.log('making request',lines[0],headers)
            for (var key in headers) {
                lines.push( key + ': ' + headers[key] )
            }
            return lines.join('\r\n') + '\r\n\r\n'
        },
        checkTimeout: function() {
            if (! this._finished) {
                this.error({error:'timeout'}) // call ontimeout instead
            }
        },
        error: function(data) {
            this._finished = true
            //console.log('error:',data)
            this.haderror = true
            if (this.onerror) {
                console.assert(typeof data == "object")
                data.target = {error:true}
                this.onerror(data)
            }
            if (! this.stream.closed) {
                this.stream.close()
            }
        },
        onStreamClose: function(evt) {
            //console.log('xhr closed')
            if (! this._finished) {
                this.error({error:'stream closed'})
            }
        },
        onCreate: function(sockInfo) {
            if (this.closed) { return }
            this.stream = new WSC.IOStream(sockInfo.socketId)
            this.stream.addCloseCallback(this.onStreamClose.bind(this))
            this.sockInfo = sockInfo
            this.connecting = true
            var host = this.getHost()
            var port = this.getPort()
            //console.log('connecting to',host,port)
            chrome.sockets.tcp.setPaused( sockInfo.socketId, true, function() {
                chrome.sockets.tcp.connect( sockInfo.socketId, host, port, _.bind(this.onConnect, this) )
            }.bind(this))
        },
        onConnect: function(result) {
            //console.log('connected to',this.getHost())
            var lasterr = chrome.runtime.lastError
            if (this.closed) { return }
            this.connecting = false
            if (this.timedOut) {
                return
            } else if (lasterr) {
                this.error({error:lasterr.message})
            } else if (result < 0) {
                this.error({error:'connection error',
                            code:result})
            } else {
                if (this.uri.protocol == 'https:' && ! this.secured) {
                    this.secured = true
                    //console.log('securing socket',this.sockInfo.socketId)
                    chrome.sockets.tcp.secure(this.sockInfo.socketId, this.onConnect.bind(this))
                    return
                }
                var headers = this.createRequestHeaders()
                //console.log('request to',this.getHost(),headers)
                this.stream.writeBuffer.add( new TextEncoder('utf-8').encode(headers).buffer )
                if (this.requestBody) {
                    this.stream.writeBuffer.add( this.requestBody )
                    this.requestBody = null
                }
                this.stream.tryWrite()
                this.stream.readUntil('\r\n\r\n', this.onHeaders.bind(this))
                chrome.sockets.tcp.setPaused( this.sockInfo.socketId, false, function(){})
            }
        },
        getHost: function() {
            return this.uri.hostname
        },
        getPort: function() {
            if (this.uri.protocol == 'https:') {
                return parseInt(this.uri.port) || 443
            } else {
                return parseInt(this.uri.port) || 80
            }
        },
        onHeaders: function(data) {
            // not sure what encoding for headers is exactly, latin1 or something? whatever.
            var headers = WSC.ui82str(new Uint8Array(data))
            //console.log('found http tracker response headers', headers)
            this.headersReceived = true
            this.responseHeaders = headers
            var response = parseHeaders(this.responseHeaders)
            this.responseDataParsed = response
            this.responseHeadersParsed = response.headers
            //console.log(this.getHost(),'parsed http response headers',response)
            this.responseLength = parseInt(response.headers['content-length'])
            this.responseBytesRead = this.stream.readBuffer.size()

            if (response.headers['transfer-encoding'] &&
                response.headers['transfer-encoding'] == 'chunked') {
                this.chunks = new WSC.Buffer
                //console.log('looking for an \\r\\n')
                this.stream.readUntil("\r\n", this.getNewChunk.bind(this))
                //this.error('chunked encoding')
            } else {
                if (! response.headers['content-length']) {
                    this.error("no content length in response")
                } else {
                    //console.log('read bytes',this.responseLength)
                    this.stream.readBytes(this.responseLength, this.onBody.bind(this))
                }
            }
        },
        onChunkDone: function(data) {
            this.chunks.add(data)
            this.stream.readUntil("\r\n", this.getNewChunk.bind(this))
        },
        getNewChunk: function(data) {
            var s = WSC.ui82str(new Uint8Array(data.slice(0,data.byteLength-2)))
            var len = parseInt(s,16)
            if (isNaN(len)) {
                this.error('invalid chunked encoding response')
                return
            }
            //console.log('looking for new chunk of len',len)
            if (len == 0) {
                //console.log('got all chunks',this.chunks)
                var body = this.chunks.flatten()
                this.onBody(body)
            } else {
                this.stream.readBytes(len+2, this.onChunkDone.bind(this))
            }
        },
        onBody: function(body) {
            this.responseBody = body
            var evt = {target: {headers:this.responseDataParsed.headers,
                                code:this.responseDataParsed.code, /* code is wrong, should be status */
                                status:this.responseDataParsed.code,
                                responseHeaders:this.responseHeaders,
                                responseHeadersParsed:this.responseHeadersParsed,
                                response:body}
                      }
            if (this.responseType && this.responseType.toLowerCase() == 'xml') {
                evt.target.responseXML = (new DOMParser).parseFromString(new TextDecoder('utf-8').decode(body), "text/xml")
            }
            this.onload(evt)
            this._finished = true
            if (! this.stream.closed) { this.stream.close() }
            // all done!!! (close connection...)
        }
    }

    function parseHeaders(s) {
        var lines = s.split('\r\n')
        var firstLine = lines[0].split(/ +/)
        var proto = firstLine[0]
        var code = firstLine[1]
        var status = firstLine.slice(2,firstLine.length).join(' ')
        var headers = {}

        for (var i=1; i<lines.length; i++) {
            var line = lines[i]
            if (line) {
                var j = line.indexOf(':')
                var key = line.slice(0,j).toLowerCase()
                headers[key] = line.slice(j+1,line.length).trim()
            }
        }
        return {code: code,
                status: status,
                proto: proto,
                headers: headers}
    }
    WSC.ChromeSocketXMLHttpRequest = ChromeSocketXMLHttpRequest

    window.testxhr = function() {
        console.log('creating XHR')
        var xhr = new ChromeSocketXMLHttpRequest
        xhr.open("GET","https://www.google.com")
        xhr.timeout = 8000
        xhr.onload = xhr.onerror = xhr.ontimeout = function(evt) {
            console.log('xhr result:',evt)
        }
        xhr.send()
        window.txhr = xhr
    }
})();
