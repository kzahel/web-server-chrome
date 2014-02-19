(function() {
    function HTTPConnection(stream) {
        this.stream = stream
    }

    HTTPConnection.prototype = {
        start: function() {
            this.stream.readUntil('\r\n\r\n',this.onHeaders.bind(this))
        },
        onHeaders: function(data) {
            debugger
        }
    }

    window.HTTPConnection = HTTPConnection;

})()
