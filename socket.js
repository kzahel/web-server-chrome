(function() {


// function to create certificate
var createCert = function(cn, data) {
  console.log(
    'Generating 1024-bit key-pair and certificate for \"' + cn + '\".');
  var keys = forge.pki.rsa.generateKeyPair(1024);
  console.log('key-pair created.');

  var cert = forge.pki.createCertificate();
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1);
  var attrs = [{
    name: 'commonName',
    value: cn
  }, {
    name: 'countryName',
    value: 'SE'
  }, {
    shortName: 'ST',
    value: 'Kronoberg'
  }, {
    name: 'localityName',
    value: 'Växjö'
  }, {
    name: 'organizationName',
    value: 'Test'
  }, {
    shortName: 'OU',
    value: 'Test'
  }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 6, // URI
      value: 'http://localhost'
    }]
  }]);
  // FIXME: add subjectKeyIdentifier extension
  // FIXME: add authorityKeyIdentifier extension
  cert.publicKey = keys.publicKey;

  // self-sign certificate
  cert.sign(keys.privateKey);

  // save data
  data[cn] = {
    cert: forge.pki.certificateToPem(cert),
    privateKey: forge.pki.privateKeyToPem(keys.privateKey)
  };

  console.log('certificate created for \"' + cn + '\": \n' + data[cn].cert);
};

var end = {};
var data = {};

// create certificate for server and client
createCert('server', data);
//createCert('client', data);
console.log(data.server.privateKey);
console.log(data.server.cert);

/*
var success = false;

// create TLS client
end.client = forge.tls.createConnection({
  server: false,
  caStore: [data.server.cert],
  sessionCache: {},
  // supported cipher suites in order of preference
  cipherSuites: [
    forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
    forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
  virtualHost: 'server',
  verify: function(c, verified, depth, certs) {
    console.log(
      'TLS Client verifying certificate w/CN: \"' +
      certs[0].subject.getField('CN').value +
      '\", verified: ' + verified + '...');
    return verified;
  },
  connected: function(c) {
    console.log('Client connected...');

    // send message to server
    setTimeout(function() {
      c.prepareHeartbeatRequest('heartbeat');
      c.prepare('Hello Server');
    }, 1);
  },
  getCertificate: function(c, hint) {
    console.log('Client getting certificate ...');
    return data.client.cert;
  },
  getPrivateKey: function(c, cert) {
    return data.client.privateKey;
  },
  tlsDataReady: function(c) {
    // send TLS data to server
    end.server.process(c.tlsData.getBytes());
  },
  dataReady: function(c) {
    var response = c.data.getBytes();
    console.log('Client received \"' + response + '\"');
    success = (response === 'Hello Client');
    c.close();
  },
  heartbeatReceived: function(c, payload) {
    console.log('Client received heartbeat: ' + payload.getBytes());
  },
  closed: function(c) {
    console.log('Client disconnected.');
    if(success) {
      console.log('PASS');
    } else {
      console.log('FAIL');
    }
  },
  error: function(c, error) {
    console.log('Client error: ' + error.message);
  }
});

// create TLS server
end.server = forge.tls.createConnection({
  server: true,
  caStore: [data.client.cert],
  sessionCache: {},
  // supported cipher suites in order of preference
  cipherSuites: [
    forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
    forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
  connected: function(c) {
    console.log('Server connected');
    c.prepareHeartbeatRequest('heartbeat');
  },
  verifyClient: true,
  verify: function(c, verified, depth, certs) {
    console.log(
      'Server verifying certificate w/CN: \"' +
      certs[0].subject.getField('CN').value +
      '\", verified: ' + verified + '...');
    return verified;
  },
  getCertificate: function(c, hint) {
    console.log('Server getting certificate for \"' + hint[0] + '\"...');
    return data.server.cert;
  },
  getPrivateKey: function(c, cert) {
    return data.server.privateKey;
  },
  tlsDataReady: function(c) {
    // send TLS data to client
    end.client.process(c.tlsData.getBytes());
  },
  dataReady: function(c) {
    console.log('Server received \"' + c.data.getBytes() + '\"');

    // send response
    c.prepare('Hello Client');
    c.close();
  },
  heartbeatReceived: function(c, payload) {
    console.log('Server received heartbeat: ' + payload.getBytes());
  },
  closed: function(c) {
    console.log('Server disconnected.');
  },
  error: function(c, error) {
    console.log('Server error: ' + error.message);
  }
});

//console.log('created TLS client and server, doing handshake...');
//end.client.handshake();

//WSC.Tls = {end: end, data: data };
*/




  // the Ssl sockets
  var string2ArrayBuffer = function(string, callback) {
    var buf = new ArrayBuffer(string.length);
    var bufView = new Uint8Array(buf);
    for (var i=0; i < string.length; i++) {
      bufView[i] = string.charCodeAt(i);
    }
    callback(buf);
  };

  var arrayBuffer2String = function(buf, callback) {
    var bufView = new Uint8Array(buf);
    var chunkSize = 65536;
    var result = '';
    for (var i = 0; i < bufView.length; i += chunkSize) {
      result += String.fromCharCode.apply(null, bufView.subarray(i, Math.min(i + chunkSize, bufView.length)));
    }
    callback(result);
  };

  var SocketSslTcp = function() {
    this._buffer = '';
    this._requiredBytes = 0;
    this._onReceive = this._onReceive.bind(this);
    this._onReceiveError = this._onReceiveError.bind(this);
    //chrome.sockets.tcp.apply(this); //net.AbstractTCPSocket.apply(this);
  };

  //SocketSslTcp.prototype.__proto__ = net.AbstractTCPSocket.prototype;
  SocketSslTcp.prototype = Object.create(chrome.sockets.tcp, {constructor: {value: SocketSslTcp}})

/* // implementation in webapp.js
  SocketSslTcp.prototype.connect = function(addr, port) {
    var _this = this;
    this._active();
    chrome.sockets.tcp.create({}, function(si) {
      _this.socketId = si.socketId;
      if (_this.socketId > 0) {
        registerSocketConnection(si.socketId);
        chrome.sockets.tcp.setPaused(_this.socketId, true);
        // Port will be of the form +port# given that it is using SSL.
        chrome.sockets.tcp.connect(_this.socketId, addr, parseInt(port.substr(1)),
            _this._onConnect.bind(_this));
      } else {
        _this.emit('error', "Couldn\'t create socket");
      }
    });
  };*/

  SocketSslTcp.prototype._onConnect = function(rc) {
    if (rc < 0) {
      this.emit('error', 'Couldn\'t connect to socket: ' +
          chrome.runtime.lastError.message + ' (error ' + (-rc) + ')');
      return;
    }
    this._initializeTls({});
    this._tls.handshake(this._tlsOptions.sessionId || null);
    chrome.sockets.tcp.onReceive.addListener(this._onReceive);
    chrome.sockets.tcp.onReceiveError.addListener(this._onReceiveError);
    chrome.sockets.tcp.setPaused(this.socketId, false);
  };

  SocketSslTcp.prototype._initializeTls = function(options) {
    var _this = this;
    this._tlsOptions = options;
    this._tls = window.forge.tls.createConnection({
        server: false,
        sessionId: options.sessionId || null,
        caStore: options.caStore || [],
        sessionCache: options.sessionCache || null,
        cipherSuites: options.cipherSuites || [
          window.forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
          window.forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
        virtualHost: options.virtualHost,
        verify: options.verify || function() { return true },
        getCertificate: options.getCertificate,
        getPrivateKey: options.getPrivateKey,
        getSignature: options.getSignature,
        deflate: options.deflate,
        inflate: options.inflate,
        connected: function(c) {
          // first handshake complete, call handler
//          if(c.handshakes === 1) {
            console.log('TLS socket connected');
            _this.emit('connect');
//          }
        },
        tlsDataReady: function(c) {
          // send TLS data over socket
          var bytes = c.tlsData.getBytes();
          string2ArrayBuffer(bytes, function(data) {
            chrome.sockets.tcp.send(_this.socketId, data, function(sendInfo) {
              if (sendInfo.resultCode < 0) {
                console.error('SOCKET ERROR on write: ' +
                    chrome.runtime.lastError.message + ' (error ' + (-sendInfo.resultCode) + ')');
              }
              if (sendInfo.bytesSent === data.byteLength) {
                _this.emit('drain');
              } else {
                if (sendInfo.bytesSent >= 0) {
                  console.error('Can\'t handle non-complete writes: wrote ' +
                      sendInfo.bytesSent + ' expected ' + data.byteLength);
                }
                _this.emit('error', 'Invalid write on socket, code: ' + sendInfo.resultCode);
              }
            });
          });
        },
        dataReady: function(c) {
          // indicate application data is ready
          var data = c.data.getBytes();
          irc.util.toSocketData(forge.util.decodeUtf8(data), function(data) {
            _this.emit('data', data);
          });
        },
        closed: function(c) {
          // close socket
          _this._close();
        },
        error: function(c, e) {
          // send error, close socket
          _this.emit('error', 'tlsError: ' + e.message);
          _this._close();
        }
      });
  };

  SocketSslTcp.prototype._onClosed = function() {
    if (this._tls && this._tls.open && this._tls.handshaking) {
      this.emit('error', 'Connection closed during handshake');
    }
  };

  SocketSslTcp.prototype.close = function() {
    if (this._tls)
      this._tls.close();
  };

  SocketSslTcp.prototype._close = function() {
    if (this.socketId != null) {
      chrome.sockets.tcp.onReceive.removeListener(this._onReceive);
      chrome.sockets.tcp.onReceiveError.removeListener(this._onReceiveError);
      chrome.sockets.tcp.disconnect(this.socketId);
      chrome.sockets.tcp.close(this.socketId);
      registerSocketConnection(this.socketId, true);
    }
    this.emit('close');
  };

  SocketSslTcp.prototype.write = function(data) {
    var _this = this;
    arrayBuffer2String(data, function(data) {
      _this._tls.prepare(data);
    });
  };

  SocketSslTcp.prototype._onReceive = function(receiveInfo) {
    if (receiveInfo.socketId != this.socketId)
      return;
    this._active();
    if (!this._tls.open)
      return;
    var _this = this;
    arrayBuffer2String(receiveInfo.data, function (data) {
      _this._buffer += data;
      if (_this._buffer.length >= _this._requiredBytes) {
        _this._requiredBytes = _this._tls.process(_this._buffer);
        _this._buffer = '';
      }
    });
  };

  SocketSslTcp.prototype._onReceiveError = function (readInfo) {
    if (readInfo.socketId != this.socketId)
      return;
    this._active();
    if (info.resultCode === -100) {  // connection closed
      this.emit('end');
      this._close();
    }
    else {
      var message = '';
      if (chrome.runtime.lastError)
        message = chrome.runtime.lastError.message;
      this.emit('error', 'read from socket: ' + message + ' (error ' +
          (-readInfo.resultCode) + ')');
      this._close();
      return;
    }
  };


    // wrapper for socket.tcp
    var SocketTcp = function() { }
    SocketTcp.prototype = Object.create(chrome.sockets.tcp, {constructor: {value: SocketTcp}});
    SocketTcp.prototype.onReceive = {
      addListener:function(cb) {
        chrome.sockets.tcp.onReceive.addListener(function(){
          console.log("SocketTcp.onReceive", arguments);
          cb.apply(this, arguments);
        });
      }
    }


    
    var SocketsSingleton = function() { }
    SocketsSingleton.prototype = Object.create(chrome.sockets, {constructor: {value: SocketsSingleton}});
    SocketsSingleton.prototype.setSsl = function(useSsl) {
        if (!useSsl) {
            SocketsSingleton.prototype.tcp = new SocketTcp; //chrome.sockets.tcp;
            SocketsSingleton.prototype.udp = chrome.sockets.udp;
            SocketsSingleton.prototype.tcpServer = chrome.sockets.tcpServer;
        } else {
            console.warn("Not ready yet");
            SocketsSingleton.prototype.tcp = new SocketSslTcp; //chrome.sockets.tcp;
            SocketsSingleton.prototype.udp = chrome.sockets.udp;
            SocketsSingleton.prototype.tcpServer = chrome.sockets.tcpServer;
        }
    }

    WSC.Sockets = new SocketsSingleton;
    WSC.Sockets.setSsl(true);
    
  
})();

