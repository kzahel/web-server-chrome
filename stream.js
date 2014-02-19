(function() {
    var socket = chrome.socket
    function IOStream(sockId) {
        this.sockId = sockId

        this.readUntilCallback = null
        this.readUntilDelimiter = null
        this.readBuffer = new Buffer
        this.writeBuffer = new Buffer
        this.reading = false

    }

    IOStream.prototype = {
        readUntil: function(delimiter, callback) {
            this.readUntilDelimiter = delimiter
            this.readUntilCallback = callback
            this.tryRead()
        },
        tryRead: function() {
            if (this.reading) { debugger;return }
            this.reading = true
            socket.read( this.sockId, 4096, this.onRead.bind(this) )
        },
        onRead: function(evt) {
            this.reading = false
            if (evt.resultCode == 0) {
                this.error({message:'remote closed connection'})
            } else if (evt.resultCode < 0) {
                this.error({message:'error code',errno:evt.resultCode})
            } else {
                this.readBuffer.add(evt.data)
                this.checkBuffer()
                this.tryRead()
            }
        },
        checkBuffer: function() {
            if (this.readUntilDelimiter) {
                var buf = this.readBuffer.flatten()
                var str = arrayBufferToString(buf)
                var idx = str.indexOf(this.readUntilDelimiter)
                if (idx != -1) {
                    var callback = this.readUntilCallback
                    var toret = this.readBuffer.consume(idx+this.readUntilDelimiter.length)
                    this.readUntilDelimiter = null
                    this.readUntilCallback = null
                    callback(toret)
                }
            }
        },
        error: function(data) {
            console.error(this,data)
        }
    }

    window.IOStream = IOStream;

})()
