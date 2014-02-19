(function() {
    function HTTPConnection(stream) {
        this.stream = stream
        console.log('new http connection')
        this.curRequest = null
        this.onRequestCallback = null
    }

    HTTPConnection.prototype = {
        tryRead: function() {
            this.stream.readUntil('\r\n\r\n',this.onHeaders.bind(this))
        },
        write: function(data) {
            if (typeof data == 'string') {
                // convert to arraybuffer
                var buf = stringToUint8Array(data).buffer
            } else {
                var buf = data
            }
            this.stream.writeBuffer.add(buf)
            this.stream.tryWrite()
        },
        addRequestCallback: function(cb) {
            this.onRequestCallback = cb 
        },
        onHeaders: function(data) {
            // TODO - http headers are Latin1, not ascii...
            var datastr = arrayBufferToString(data)
            var lines = datastr.split('\r\n')
            var firstline = lines[0]
            var flparts = firstline.split(' ')
            var method = flparts[0]
            var uri = flparts[1]
            var version = flparts[2]

            var headers = {}
            // TODO - multi line headers?
            for (var i=1;i<lines.length-2;i++) {
                var l = lines[i].split(':')
                headers[l[0].toLowerCase()] = l[1].trim()
            }
            this.curRequest = new Request({headers:headers,
                                           method:method,
                                           uri:uri,
                                           version:version,
                                           connection:this})
            if (headers['Content-Length']) {
                var clen = parseInt(headers['Content-Length'])
                // TODO -- handle 100 continue..
                this.stream.readBytes(clen, this.onRequest)
            } else if (method == 'GET') {
                this.onRequest(this.curRequest)
            } else {
                console.error('how to handle',this.curRequest)
            }
        },
        onRequest: function(request) {
            this.onRequestCallback(request)
        }
    }

    window.HTTPConnection = HTTPConnection;

})()
