(function() {

    var peerSockMap = {}

    function onTCPReceive(info) {
        var sockId = info.socketId
        if (peerSockMap[sockId]) {
            peerSockMap[sockId].onReadTCP(info)
        }
    }

    chrome.sockets.tcp.onReceive.addListener( onTCPReceive )


    var sockets = chrome.sockets
    function IOStream(sockId) {
        this.sockId = sockId
        peerSockMap[this.sockId] = this
        this.readCallback = null
        this.readUntilDelimiter = null
        this.readBuffer = new Buffer
        this.writeBuffer = new Buffer
        this.reading = false
        this.writing = false
        this.pleaseReadBytes = null

        this.remoteclosed = false
        this.closed = false
        this.onclose = null

        this.onWriteBufferEmpty = null
        chrome.sockets.tcp.setPaused(this.sockId, false, this.onUnpaused.bind(this))
    }

    IOStream.prototype = {
        onUnpaused: function(info) {
            //console.log('sock unpaused',info)
        },
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
        tryWrite: function(callback) {
            if (this.writing) { 
                //console.warn('already writing..'); 
                return
            }
            if (this.closed) { 
                console.warn(this.sockId,'cant write, closed'); 
                return 
            }
            //console.log('tryWrite')
            this.writing = true
            var data = this.writeBuffer.consume_any_max(4096)
            sockets.tcp.send( this.sockId, data, this.onWrite.bind(this, callback) )
        },
        onWrite: function(callback, evt) {
            // look at evt!
            if (evt.bytesWritten <= 0) {
                console.log('onwrite fail, closing',evt)
                this.close()
            }
            this.writing = false
            if (this.writeBuffer.size() > 0) {
                //console.log('write more...')
                if (this.closed) {
                } else {
                    this.tryWrite(callback)
                }
            } else {
                if (this.onWriteBufferEmpty) { this.onWriteBufferEmpty(); }
            }
        },
        tryRead: function() {
            if (this.remoteclosed) {
                console.warn('cannot read, socket is halfduplex')
                debugger
                return
            }
            if (this.closed) {
                console.warn(this.sockId,'cant read, closed')
                return
            }
            if (this.reading) { 
                //console.warn('already reading..'); 
                return 
            }
            this.reading = true
            //sockets.tcp.read( this.sockId, 4096, this.onRead.bind(this) )
        },
        onReadTCP: function(evt) {
            //console.log('onRead',evt)
            this.reading = false
            if (evt.resultCode == 0) {
                //this.error({message:'remote closed connection'})
                //this.log('remote closed connection (halfduplex)')
                this.remoteclosed = true
                if (this.halfclose) { this.halfclose() }
                //if (this.onclose) { this.onclose() } // not really closed..
                if (this.request) {
                    // do we even have a request yet? or like what to do ...
                }
            } else if (evt.resultCode < 0) {
                this.log('remote killed connection')
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
        close: function() {
            if (this.onclose) { this.onclose() }
            console.log('tcp sock destroy',this.sockId)
            delete peerSockMap[this.sockId]
            sockets.tcp.disconnect(this.sockId)
            sockets.tcp.destroy(this.sockId)
            //this.sockId = null
            this.closed = true
        },
        error: function(data) {
            console.warn(this.sockId,'closed')
            //console.error(this,data)
            // try close by writing 0 bytes
            if (! this.closed) {
                this.close()
            }

        },
        tryClose: function(callback) {
            if (! this.closed) {
                console.warn('cant close, already closed')
                return
            }
            sockets.tcp.send(this.sockId, new ArrayBuffer, callback)
        }
    }

    window.IOStream = IOStream;

})()
