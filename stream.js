(function() {

/*
	const serverCert = 
"-----BEGIN CERTIFICATE-----\n\
MIICgjCCAeugAwIBAgIBATANBgkqhkiG9w0BAQsFADBpMQ8wDQYDVQQDEwZzZXJ2\n\
ZXIxCzAJBgNVBAYTAlNFMRAwDgYDVQQIEwd0ZXN0LXN0MRYwFAYDVQQHEw10ZXN0\n\
LWxvY2FsaXR5MRAwDgYDVQQKEwdUZXN0YXBwMQ0wCwYDVQQLEwRUZXN0MB4XDTIx\n\
MDQwMjE4NDMwOVoXDTIyMDQwMjE4NDMwOVowaTEPMA0GA1UEAxMGc2VydmVyMQsw\n\
CQYDVQQGEwJTRTEQMA4GA1UECBMHdGVzdC1zdDEWMBQGA1UEBxMNdGVzdC1sb2Nh\n\
bGl0eTEQMA4GA1UEChMHVGVzdGFwcDENMAsGA1UECxMEVGVzdDCBnzANBgkqhkiG\n\
9w0BAQEFAAOBjQAwgYkCgYEAltdStr9uz5ndmHEoYa7fuByeH5xf3r8qxYM2i0mL\n\
LL4zENjjtyjoucHs+s6M3UpXEJYeo8wp5pYgAvAJsiDox1TvlD7NsZW14yZE5Z59\n\
P40E1UfMVvdB1s/yVIvwzsjp61T7qg0ZvRlCVDW5ibHKMhEFAaSkxv4l85TBkePL\n\
MDMCAwEAAaM6MDgwDAYDVR0TBAUwAwEB/zALBgNVHQ8EBAMCAvQwGwYDVR0RBBQw\n\
EoYQaHR0cDovL2xvY2FsaG9zdDANBgkqhkiG9w0BAQsFAAOBgQBRMcCIXhW4I0uA\n\
dpWlgUpQzDz2aesgP7GdtOOh/b/kP2dxjzIC1Maobhiylzi/EFnHAQumNpTmlCFr\n\
EEhGjcQ8/FEuhhMIizCKIuj5hXKgHy/cT9GYhVZ2jWk7nC4Bv4kghWDzcymW1TtI\n\
qPB0mRGeBl+rnnQYRMd2AyOcspI5RQ==\n\
-----END CERTIFICATE-----";

    const privateKey =
"-----BEGIN RSA PRIVATE KEY-----\n\
MIICWwIBAAKBgQCW11K2v27Pmd2YcShhrt+4HJ4fnF/evyrFgzaLSYssvjMQ2OO3\n\
KOi5wez6zozdSlcQlh6jzCnmliAC8AmyIOjHVO+UPs2xlbXjJkTlnn0/jQTVR8xW\n\
90HWz/JUi/DOyOnrVPuqDRm9GUJUNbmJscoyEQUBpKTG/iXzlMGR48swMwIDAQAB\n\
AoGAYiEka0Twhtf3ZDPBbIMCgdkEOVZWvCcrYSDye/zVML9vozcmNULE3Au/6o4y\n\
78dsCptOxYqNe7gQjTixZhOouvzaVFAIZ8cbxfwYIBUFqNncTePSOOZOGVe5ufvT\n\
Pa8rb4SgDl2aRCyo4wrPE9laXpcJsenA/ZdloezKcZHZsMECQQDIK6LMt2bNXPPS\n\
iYrLJOg5fxos0gRvHMx/lmhRunHSOO5v7GdPCG9NTMfu/IwX+7aY9h4xbYisUhdg\n\
2xMgVtghAkEAwOmGJ+XQMtO+U1QyeYgvdaUQSjPDQBRHKHogfizqQg7+2hLyj50C\n\
y6WFuKXn0e9WypNgicf3fqfPPhmH6BFt0wJAOslN649lOqS02r0YLObu6IvidQ1M\n\
zhEIIeRbSL1X1iRwKiCkinpwraQCB7bVselzy+JkJaIEhI8rXH+aU2IN4QI/BgdG\n\
KfkEiJIVYIVBDosy8Ho4CBmWAGqhzqICYe8FYwsU67ur2NEPRU3m395PYEAadjok\n\
yil1kn+r+kTR+m6RAkEAkIOQOleOZ+btbQTETMEDFnO/g6cuVhSXoemGmY6BY8k4\n\
14AmYpksffL217BZU5OUcWVfCyNBfYZCklaakhK9Jw==\n\
-----END RSA PRIVATE KEY-----";
*/
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
            this._writeToTcp(data, this.onWrite.bind(this, callback));
        },
		write: function(data) {
			this.writeBuffer.add(data)
			this.tryWrite()
		},
        // may be overridden by StreamTls
        _writeToTcp: function(data, cb) {
            chrome.sockets.tcp.send( this.sockId, data, cb);
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
                this._fillReadBuffer(evt.data)
            }
        },
        // specialized so IOStreamTls can subclass
        _fillReadBuffer: function(data) {
            this.readBuffer.add(data);
            if (this.onread) { this.onread() }
            this.checkBuffer()
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
            chrome.sockets.tcp.close(this.sockId, this.onClosed.bind(this,reason))
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
            chrome.sockets.tcp.send(this.sockId, new ArrayBuffer, callback)
        },
        cleanup: function() {
            this.writeBuffer = new WSC.Buffer
        }
    }


     var arrayBuffer2String = function(buf) {
		var bufView = new Uint8Array(buf);
		var chunkSize = 65536;
		var result = '';
		for (var i = 0; i < bufView.length; i += chunkSize) {
		  result += String.fromCharCode.apply(null, bufView.subarray(i, Math.min(i + chunkSize, bufView.length)));
		}
		return result;
     }


    var IOStreamTls = function(sockId, privateKey, serverCert) {
        this.writeCallbacks = [];
        this.readCallbacks = [];
        var _t = this;

		this.tlsServer = forge.tls.createConnection({
		  server: true,
		  sessionCache: {},
		  // supported cipher suites in order of preference
		  cipherSuites: [
			forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
			forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
		  connected: function(c) {
			//console.log('Server connected');
			//c.prepareHeartbeatRequest('heartbeat');
		  },
		  verifyClient: false,
		  getCertificate: function(c, hint) {
			//console.log('Server getting certificate for \"' + hint[0] + '\"...');
			return serverCert; //WSC.Tls.data.server.cert;
		  },
		  getPrivateKey: function(c, cert) {
			//console.log('Server getting privateKey for \"' + cert + '\"...');
			return privateKey;//WSC.Tls.data.server.privateKey;
		  },
		  tlsDataReady: function(c) {
			// send TLS data to client
			var cb = _t.writeCallbacks.pop() || function(){};
			let str = c.tlsData.getBytes();
			var b = WSC.str2ab(str);
			//console.log('encrypt to client: ' + str);
			if (this.connected)
                chrome.sockets.tcp.send( _t.sockId, b, cb);
            else
                _t.error("tlsData on closed socket");
		  },
		  dataReady: function(c) {
		  	// decrypted data from client
		  	let str = c.data.getBytes();
			//console.log('client sent \"' + str + '\"');
			_t.readBuffer.add(WSC.str2ab(str));
            if (_t.onread) { _t.onread() }
            _t.checkBuffer()
		  },
		  heartbeatReceived: function(c, payload) {
			//console.log('Server received heartbeat: ' + payload.getBytes());
		  },
		  closed: function(c) {
			console.log('Server disconnected.');
		  },
		  error: function(c, error) {
			console.log(error.origin + ' error: ' + error.message + ' at level:' + error.alert.level + ' desc:' + error.alert.description);
		  }
		});

    	IOStream.apply(this, arguments);
    }
    IOStreamTls.prototype = {
        _writeToTcp: function(data, cb) {
        	let s = WSC.ui82str(new Uint8Array(data));
        	this.writeCallbacks.push(cb);
        	this.tlsServer.prepare(s);
        },
        _fillReadBuffer: function(data) {
        	let str = arrayBuffer2String(data);
        	let n = this.tlsServer.process(str);
        }
    };
    IOStreamTls.prototype.__proto__ = IOStream.prototype;
     
    WSC.IOStreamTls = IOStreamTls;
    WSC.IOStream = IOStream;

})();
