(function() {
    function Request(opts) {
        this.method = opts.method
        this.uri = opts.uri
        this.version = opts.version
        this.connection = opts.connection
        this.headers = opts.headers

        this.arguments = {}
        var idx = this.uri.indexOf('?')
        if (idx != -1) {
            this.path = decodeURI(this.uri.slice(0,idx))
            var s = this.uri.slice(idx+1)
            var parts = s.split('&')
            for (var i=0; i<parts.length; i++) {
                var idx2 = parts[i].indexOf('=')
                this.arguments[decodeURIComponent(s.slice(0,idx2))] = docodeURIComponent(s.slice(idx2+1,s.length))
            }

        }else {
            this.path = decodeURI(this.uri)
        }

        this.origpath = this.path

        if (this.path[this.path.length-1] == '/') {
            this.path = this.path.slice(0,this.path.length-1)
        }
        
    }

    Request.prototype = {
        isKeepAlive: function() {
            return this.headers['connection'] && this.headers['connection'].toLowerCase() != 'close'
        }
    }

    window.Request = Request
})()