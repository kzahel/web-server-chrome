(function() {
    function HTTPRequest(opts) {
        this.method = opts.method
        this.uri = opts.uri
        this.version = opts.version
        this.connection = opts.connection
        this.headers = opts.headers
        this.body = null
        this.bodyparams = null

        this.arguments = {}
        var idx = this.uri.indexOf('?')
        if (idx != -1) {
            this.path = decodeURIComponent(this.uri.slice(0,idx))
            var s = this.uri.slice(idx+1)
            var parts = s.split('&')

            for (var i=0; i<parts.length; i++) {
                var p = parts[i]
                var idx2 = p.indexOf('=')
                this.arguments[decodeURIComponent(p.slice(0,idx2))] = decodeURIComponent(p.slice(idx2+1,s.length))
            }
        } else {
            this.path = decodeURIComponent(this.uri)
        }

        this.origpath = this.path

        if (this.path[this.path.length-1] == '/') {
            this.path = this.path.slice(0,this.path.length-1)
        }
        
    }

    HTTPRequest.prototype = {
        isKeepAlive: function() {
            return this.headers['connection'] && this.headers['connection'].toLowerCase() != 'close'
        }
    }

    WSC.HTTPRequest = HTTPRequest
})();
