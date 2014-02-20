(function() {
    var socket = chrome.socket
    function IOStream(sockId) {
        this.sockId = sockId

        this.readCallback = null
        this.readUntilDelimiter = null
        this.readBuffer = new Buffer
        this.writeBuffer = new Buffer
        this.reading = false
        this.writing = false
        this.pleaseReadBytes = null

        this.remoteclosed = false
        this.closed = false

    }

    IOStream.prototype = {
        readUntil: function(delimiter, callback) {
            this.readUntilDelimiter = delimiter
            this.readCallback = callback
            this.tryRead()
        },
        readBytes: function(numBytes, callback) {
            this.pleaseReadBytes = numBytes
            this.readCallback = callback
            this.checkBuffer()
            this.tryRead()
        },
        tryWrite: function() {
            if (this.writing) { 
                //console.warn('already writing..'); 
                return
            }
            //console.log('tryWrite')
            this.writing = true
            var data = this.writeBuffer.consume_any_max(4096)
            socket.write( this.sockId, data, this.onWrite.bind(this) )
        },
        onWrite: function(evt) {
            this.writing = false
            //console.log('onWrite',evt)
            if (this.writeBuffer.size() > 0) {
                //console.log('write more...')
                this.tryWrite()
            }
        },
        tryRead: function() {
            if (this.remoteclosed) {
                console.warn('cannot read, socket is halfduplex')
                debugger
                return
            }
            if (this.reading) { 
                //console.warn('already reading..'); 
                return 
            }
            this.reading = true
            socket.read( this.sockId, 4096, this.onRead.bind(this) )
        },
        onRead: function(evt) {
            //console.log('onRead',evt)
            this.reading = false
            if (evt.resultCode == 0) {
                //this.error({message:'remote closed connection'})
                this.log('remote closed connection')
                this.remoteclosed = true
                if (this.request) {
                    // do we even have a request yet? or like what to do ...
                }
            } else if (evt.resultCode < 0) {
                this.error({message:'error code',errno:evt.resultCode})
            } else {
                this.readBuffer.add(evt.data)
                this.checkBuffer()
                this.tryRead()
            }
        },
        log: function(msg) {
            console.log(this.sockId,msg)
        },
        checkBuffer: function() {
            //console.log('checkBuffer')
            if (this.readUntilDelimiter) {
                var buf = this.readBuffer.flatten()
                var str = arrayBufferToString(buf)
                var idx = str.indexOf(this.readUntilDelimiter)
                if (idx != -1) {
                    var callback = this.readCallback
                    var toret = this.readBuffer.consume(idx+this.readUntilDelimiter.length)
                    this.readUntilDelimiter = null
                    this.readCallback = null
                    callback(toret)
                }
            } else if (this.pleaseReadBytes) {
                if (this.readBuffer.size() >= this.pleaseReadBytes) {
                    var data = this.readBuffer.consume(this.pleaseReadBytes)
                    var callback = this.readCallback
                    this.readCallback = null
                    this.pleaseReadBytes = null
                    callback(data)
                }
            }
        },
        error: function(data) {
            console.error(this,data)
            // try close by writing 0 bytes


                socket.disconnect(this.sockId)
                socket.destroy(this.sockId)
                this.sockId = null

        },
        tryClose: function(callback) {
            socket.write(this.sockId, new ArrayBuffer, callback)
        }
    }

    window.IOStream = IOStream;

})()
