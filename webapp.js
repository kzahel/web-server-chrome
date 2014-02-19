(function(){
    var socket = chrome.socket

    function WebApplication(opts) {
        this.opts = opts
        this.connections = {}
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
                                      socket.accept(this.sockInfo.socketId, this.onAccept.bind(this));
                                  }
                              }.bind(this))
            }.bind(this));
        },
        onAccept: function(acceptInfo) {
            console.log('onAccept',acceptInfo);
            if (acceptInfo.socketId) {
                var stream = new IOStream(acceptInfo.socketId)
                var connection = new HTTPConnection(stream)
                this.connections[acceptInfo.socketId] = connection
                connection.start()
                //connection.readUntil('\r\n\r\n', this.onHeaders.bind(this))
            }
        },
        onHeaders: function(conn) {
            debugger
        }
    }

    chrome.WebApplication = WebApplication

})();