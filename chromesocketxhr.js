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

        this.readBuffer = new WSC.Buffer
        this.writeBuffer = new WSC.Buffer

        this.connecting = false
        this.writing = false
        this.haderror = false
        this.closed = false

        this.sockInfo = null

        this.extraHeaders = {}

        this.headersReceived = false
        this.responseHeaders = null
        this.responseHeadersParsed = null
        this.responseBody = null
        this.responseLength = null
        this.responseBytesRead = null
    }

    ChromeSocketXMLHttpRequest.prototype = {
        open: function(method, url, async) {
            this.opts = { method:method,
                          url:url,
                          async:true }
            this.uri = WSC.parseUri(this.opts.url)
            console.assert(this.uri.protocol == 'http:') // https not supported for chrome.socket yet
        },
        setRequestHeader: function(key, val) {
            this.extraHeaders[key] = val
        },
        send: function(data) {
            console.assert( ! data ) // do not support sending request body yet
            chrome.sockets.tcp.create({}, _.bind(this.onCreate, this))
            if (this.timeout !== 0) {
                this.timeoutId = setTimeout( _.bind(this.checkTimeout, this), this.timeout )
            }
        },
        createRequestHeaders: function() {
            var lines = []
            var headers = {'Connection': 'close',
                           //'Accept-Encoding': 'identity', // servers will send us chunked encoding even if we dont want it, bastards
                           'Accept-Encoding': 'identity;q=1.0 *;q=0', // servers will send us chunked encoding even if we dont want it, bastards
                           //                       'User-Agent': 'uTorrent/330B(30235)(server)(30235)', // setRequestHeader /extra header is doing this
                           'Host': this.uri.host}
            _.extend(headers, this.extraHeaders)
            if (this.opts.method == 'GET') {
//                headers['Content-Length'] == '0'
            } else {
                this.error('unsupported method')
            }

            lines.push(this.opts.method + ' ' + this.uri.pathname + ' HTTP/1.1')
            console.log('making request',lines[0],headers)
            for (var key in headers) {
                lines.push( key + ': ' + headers[key] )
            }
            return lines.join('\r\n') + '\r\n\r\n'
        },
        checkTimeout: function() {
            if (! this.responseBody) {
                this.error({error:'timeout'})
            }
        },
        error: function(data) {
            this.haderror = true
            if (! this.closed) {
                this.close()
            }
            if (this.onerror) {
                this.onerror(data)
            }
        },
        onCreate: function(sockInfo) {
            if (this.closed) { return }
            this.sockInfo = sockInfo
            WSC.peerSockMap[sockInfo.socketId] = this
            this.connecting = true
            chrome.sockets.tcp.connect( sockInfo.socketId, this.getHost(), this.getPort(), _.bind(this.onConnect, this) )
        },
        onConnect: function(result) {
            if (this.closed) { return }
            this.connecting = false
            if (this.timedOut) {
                return
            } else if (result < 0) {
                this.error({error:'connection error',
                            code:result})
            } else {
                var headers = this.createRequestHeaders()
                this.writeBuffer.add( new TextEncoder('utf-8').encode(headers).buffer )
                this.writeFromBuffer()
            }
        },
        getHost: function() {
            return this.uri.host
        },
        getPort: function() {
            return parseInt(this.uri.port) || 80
        },
        writeFromBuffer: function() {
            if (this.closed) { return }
            console.assert(! this.writing)
            this.writing = true
            var data = this.writeBuffer.consume_any_max(4096)
            //console.log('writing data',ui82str(data))
            chrome.sockets.tcp.send( this.sockInfo.socketId, data, _.bind(this.onWrite,this) )
        },
        onWrite: function(result) {
            this.writing = false
            //console.log('write to socket',result)
        },
        close: function() {
            this.closed = true
            if (this.sockInfo) {
                chrome.sockets.tcp.disconnect(this.sockInfo.socketId)
                chrome.sockets.tcp.close(this.sockInfo.socketId)
                delete WSC.peerSockMap[this.sockInfo.socketId]
                this.sockInfo = null
            }
        },
        onReadTCP: function(result) {
            if (result.data) {
                //console.log('onreadTCP',result.data.byteLength)
            } else {
                //console.log('onreadTCP',result)
            }
            this.onRead(result)
        },
        onRead: function(result) {
            //console.log('onRead',this.responseBytesRead, this.responseLength)
            if (result.resultCode < 0) {
                // https://code.google.com/p/chromium/codesearch#chromium/src/net/base/net_error_list.h&sq=package:chromium&l=111
                // (list of codes)
                this.closed = true
                if (! this._finished) {
                    this.tryParseResponse()
                    return
                }
                // all done!
            }
            //console.log('onread',result.data.byteLength, [WSC.ui82str(new Uint8Array(result.data))])
            if (this.closed) { return }
            if (result.data.byteLength == 0) {
                console.warn('remote closed connection! readbuf',buf)
                this.close()
                // remote closed connection
            } else {
                this.readBuffer.add( result.data )
                this.responseBytesRead += result.data.byteLength
                this.tryParseResponse()
            }
        },
        tryParseResponse: function() {
            if (! this.headersReceived) {
                var data = this.readBuffer.flatten()
                var idx = ui8IndexOf(new Uint8Array(data),_.map('\r\n\r\n', function(c){return c.charCodeAt(0)}))
                if (idx != -1) {
                    // not sure what encoding for headers is exactly, latin1 or something? whatever.
                    var headers = WSC.ui82str(new Uint8Array(data, 0, idx + 4))
                    //console.log('found http tracker response headers', headers)
                    this.headersReceived = true
                    this.responseHeaders = headers
                    this.readBuffer.consume(idx+4)

                    var response = parseHeaders(this.responseHeaders)
                    this.responseDataParsed = response
                    this.responseHeadersParsed = response.headers
                    console.log('parsed http response',response)
                    this.responseLength = parseInt(response.headers['content-length'])
                    this.responseBytesRead = this.readBuffer.size()

                    if (response.headers['transfer-encoding'] &&
                        response.headers['transfer-encoding'] == 'chunked') {
                        console.warn('this will break!')
                        this.error('chunked encoding')
                    } else {
                        if (! response.headers['content-length']) {
                            this.error("no content length in response")
                        } else {
                            this.tryParseBody()
                        }
                    }
                }
            } else {
                this.tryParseBody()
            }
        },
        tryParseBody: function() {
            if (this.responseBytesRead == this.responseLength) {
                var body = this.readBuffer.flatten()
                this.responseBody = body
                var evt = {target: {headers:this.responseDataParsed.headers,
                                    code:this.responseDataParsed.code,
                                    responseHeaders:this.responseHeaders,
                                    responseHeadersParsed:this.responseHeadersParsed,
                                    response:body}
                          }
                this.onload(evt)
                this._finished = true
                // all done!!! (close connection...)
            }
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
})();
