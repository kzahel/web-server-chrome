(function() {

    var peerSockMap = {}

    function onTCPReceive(info) {
        var sockId = info.socketId
        if (peerSockMap[sockId]) {
            peerSockMap[sockId].onReadTCP(info)
        }
    }

    chrome.sockets.tcp.onReceive.addListener( onTCPReceive )
    chrome.sockets.tcp.onReceiveError.addListener( onTCPReceive )


    var sockets = chrome.sockets
    function IOStream(sockId) {
        this.sockId = sockId
        peerSockMap[this.sockId] = this
        this.readCallback = null
        this.readUntilDelimiter = null
        this.readBuffer = new Buffer
        this.writeBuffer = new Buffer
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
            //this.tryRead() // set unpaused instead
        },
        readBytes: function(numBytes, callback) {
            this.pleaseReadBytes = numBytes
            this.readCallback = callback
            this.checkBuffer()
            //this.tryRead() // set unpaused instead
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
            //console.log(this.sockId,'tcp.send',data.byteLength)
            sockets.tcp.send( this.sockId, data, this.onWrite.bind(this, callback) )
            //console.log(this.sockId,'tryWrite, lasterr',chrome.runtime.lastError)
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
        onReadTCP: function(evt) {
            //console.log('onRead',evt)
            if (evt.resultCode == 0) {
                //this.error({message:'remote closed connection'})
                this.log('remote closed connection (halfduplex)')
                this.remoteclosed = true
                if (this.halfclose) { this.halfclose() }
                //if (this.onclose) { this.onclose() } // not really closed..
                if (this.request) {
                    // do we even have a request yet? or like what to do ...
                }
            } else if (evt.resultCode < 0) {
                this.log('remote killed connection',evt.resultCode)
                this.error({message:'error code',errno:evt.resultCode})
            } else {
                this.readBuffer.add(evt.data)
                this.checkBuffer()
            }
        },

        log: function(msg,msg2,msg3) {
            console.log(this.sockId,msg,msg2,msg3)
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
            console.log('tcp sock close',this.sockId)
            delete peerSockMap[this.sockId]
            sockets.tcp.disconnect(this.sockId)
            if (chrome.runtime.lastError) {
                debugger
            }
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
            console.log(this.sockId,'tryClose')
            sockets.tcp.send(this.sockId, new ArrayBuffer, callback)
            console.log(this.sockId,'tryClose, lasterr',chrome.runtime.lastError)
        }
    }

    window.IOStream = IOStream;

})()
