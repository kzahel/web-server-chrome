(function() {

    var peerSockMap = {}
    WSC.peerSockMap = peerSockMap

    function onTCPReceive(info) {
        var sockId = info.socketId
        if (WSC.peerSockMap[sockId]) {
            WSC.peerSockMap[sockId].onReadTCP(info)
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
        this.readBuffer = new WSC.Buffer
        this.writeBuffer = new WSC.Buffer
        this.writing = false
        this.pleaseReadBytes = null

        this.remoteclosed = false
        this.closed = false
        this.connected = true

        this.halfclose = null
        this.onclose = null
        this.ondata = null
        this.source = null
        this._close_callbacks = []

        this.onWriteBufferEmpty = null
        chrome.sockets.tcp.setPaused(this.sockId, false, this.onUnpaused.bind(this))
    }

    IOStream.prototype = {
		set_close_callback: function(fn) {
			this._close_callbacks = [fn]
		},
		set_nodelay: function() {
			chrome.sockets.tcp.setNoDelay(this.sockId, true, function(){})
		},
        removeHandler: function() {
            delete peerSockMap[this.sockId]
        },
        addCloseCallback: function(cb) {
            this._close_callbacks.push(cb)
        },
        peekstr: function(maxlen) {
            return WSC.ui82str(new Uint8Array(this.readBuffer.deque[0], 0, maxlen))
        },
        removeCloseCallback: function(cb) {
            debugger
        },
        runCloseCallbacks: function() {
            for (var i=0; i<this._close_callbacks.length; i++) {
                this._close_callbacks[i](this)
            }
            if (this.onclose) { this.onclose() }
        },
        onUnpaused: function(info) {
            var lasterr = chrome.runtime.lastError
            if (lasterr) {
                this.close('set unpause fail')
            }
            //console.log('sock unpaused',info)
        },
        readUntil: function(delimiter, callback) {
            this.readUntilDelimiter = delimiter
            this.readCallback = callback
            this.checkBuffer()
        },
        readBytes: function(numBytes, callback) {
            this.pleaseReadBytes = numBytes
            this.readCallback = callback
            this.checkBuffer()
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
            //console.log(this.sockId,'tcp.send',WSC.ui82str(new Uint8Array(data)))
            sockets.tcp.send( this.sockId, data, this.onWrite.bind(this, callback) )
        },
		write: function(data) {
			this.writeBuffer.add(data)
			this.tryWrite()
		},
        onWrite: function(callback, evt) {
            var err = chrome.runtime.lastError
            if (err) {
                //console.log('socket.send lastError',err)
                //this.tryClose()
                this.close('writeerr'+err)
                return
            }

            // look at evt!
            if (evt.bytesWritten <= 0) {
                //console.log('onwrite fail, closing',evt)
                this.close('writerr<0')
                return
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
            var lasterr = chrome.runtime.lastError
            if (lasterr) {
                this.close('read tcp lasterr'+lasterr)
                return
            }
            //console.log('onRead',WSC.ui82str(new Uint8Array(evt.data)))
            if (evt.resultCode == 0) {
                //this.error({message:'remote closed connection'})
                this.log('remote closed connection (halfduplex)')
                this.remoteclosed = true
                if (this.halfclose) { this.halfclose() }
                if (this.request) {
                    // do we even have a request yet? or like what to do ...
                }
            } else if (evt.resultCode < 0) {
                this.log('remote killed connection',evt.resultCode)
                this.error({message:'error code',errno:evt.resultCode})
            } else {
                this.readBuffer.add(evt.data)
                if (this.onread) { this.onread() }
                this.checkBuffer()
            }
        },
        log: function(msg,msg2,msg3) {
			if (WSC.VERBOSE) {
				console.log(this.sockId,msg,msg2,msg3)
			}
        },
        checkBuffer: function() {
            //console.log('checkBuffer')
            if (this.readUntilDelimiter) {
                var buf = this.readBuffer.flatten()
                var str = WSC.arrayBufferToString(buf)
                var idx = str.indexOf(this.readUntilDelimiter)
                if (idx != -1) {
                    var callback = this.readCallback
                    var toret = this.readBuffer.consume(idx+this.readUntilDelimiter.length)
                    this.readUntilDelimiter = null
                    this.readCallback = null
                    callback(toret)
                }
            } else if (this.pleaseReadBytes !== null) {
                if (this.readBuffer.size() >= this.pleaseReadBytes) {
                    var data = this.readBuffer.consume(this.pleaseReadBytes)
                    var callback = this.readCallback
                    this.readCallback = null
                    this.pleaseReadBytes = null
                    callback(data)
                }
            }
        },
        close: function(reason) {
			if ( this.closed) { return }
            this.connected = false
            this.closed = true
            this.runCloseCallbacks()
            //console.log('tcp sock close',this.sockId)
            delete peerSockMap[this.sockId]
            sockets.tcp.close(this.sockId, this.onClosed.bind(this,reason))
            //this.sockId = null
            this.cleanup()
        },
        onClosed: function(reason, info) {
            var lasterr = chrome.runtime.lastError
            if (lasterr) {
                console.log('onClosed',reason,lasterr,info)
            } else {
                //console.log('onClosed',reason,info)
            }
        },
        error: function(data) {
            console.warn(this.sockId,'closed')
            //console.error(this,data)
            // try close by writing 0 bytes
            if (! this.closed) {
                this.close()
            }
        },
        checkedCallback: function(callback) {
            var err = chrome.runtime.lastError;
            if (err) {
                console.warn('socket callback lastError',err,callback)
            }
        },
        tryClose: function(callback) {
            if (!callback) { callback=this.checkedCallback }
            if (! this.closed) {
                console.warn('cant close, already closed')
                this.cleanup()
                return
            }
            console.log(this.sockId,'tryClose')
            sockets.tcp.send(this.sockId, new ArrayBuffer, callback)
        },
        cleanup: function() {
            this.writeBuffer = new WSC.Buffer
        }
    }

    WSC.IOStream = IOStream;

})();
