// multiple devices are using the same extenal port. need to retry for other ports, or randomize chosen port based on GUID would be easiest.

// if switching from wlan to eth, it will fail to map the port because we mapped on the other interface.

// check current mappings and don't attempt to map to an externally bound port

// could choose port by hashing GUID + interface name

// inspiration from https://github.com/indutny/node-nat-upnp
(function() {
    function flatParseNode(node) {
        var d = {}
        for (var i=0; i<node.children.length; i++) {
            var c = node.children[i]
            if (c.children.length == 0) {
                d[c.tagName] = c.innerHTML
            }
        }
        return d
    }
    
    function UPNP(opts) {
        this.port = opts.port
		this.name = opts.name || 'web-server-chrome upnp.js'
		this.searchtime = opts.searchtime || 2000
        this.ssdp = new SSDP({port:opts.port, searchtime:this.searchtime})
        this.desiredServices = [
            'urn:schemas-upnp-org:service:WANIPConnection:1',
            'urn:schemas-upnp-org:service:WANPPPConnection:1'
        ]
        this.validGateway = null
        this.interfaces = null
        this.mapping = null
        this.searching = false
    }
    UPNP.prototype = {
        allDone: function(result) {
            if (this.callback) { this.callback(result) }
        },
        getInternalAddress: function() {
            var gatewayhost = this.validGateway.device.url.hostname
            var gateparts = gatewayhost.split('.')
            var match = false

            for (var i=gateparts.length-1;i--;i<1) {
                var pre = gateparts.slice(0, i).join('.')
                for (var j=0; j<this.interfaces.length; j++) {
                    if (this.interfaces[j].prefixLength == 24) {
                        var iparts = this.interfaces[j].address.split('.')
                        var ipre = iparts.slice(0,i).join('.')
                        if (ipre == pre) {
                            match = this.interfaces[j].address
                            console.clog("UPNP","selected internal address",match)
                            return match
                        }
                    }
                }

            }
        },
        reset: function(callback) {
            this.callback = callback
            console.clog('UPNP', "search start")
            this.searching = true
            chrome.system.network.getNetworkInterfaces( function(interfaces) {
                this.interfaces = interfaces
                this.devices = []
				// TODO -- remove event listeners
                this.ssdp.addEventListener('device',this.onDevice.bind(this))
                this.ssdp.addEventListener('stop',this.onSearchStop.bind(this))
                this.ssdp.search() // stop searching after a bit.
            }.bind(this) )
        },
        onSearchStop: function(info) {
            console.clog('UPNP', "search stop")
            this.searching = false
            this.getIP( function(gotIP) {
                if (! gotIP) { return this.allDone(false) }
                this.getMappings( function(mappings) {
                    if (! mappings) { return this.allDone(false) }
                    // check if already exists nice mapping we can use.
                    var internal = this.getInternalAddress()
                    console.clog('UPNP','got current mappings',mappings,'internal address',internal)
                    for (var i=0; i<mappings.length; i++) {
                        if (mappings[i].NewInternalClient == internal &&
                            mappings[i].NewInternalPort == this.port &&
                            mappings[i].NewProtocol == "TCP") {
                            // found it
                            console.clog('UPNP','already have port mapped')
                            this.mapping = mappings[i]
                            this.allDone(true)
                            return
                        }
                    }
                    this.addMapping(this.port, 'TCP', function(result) {
                        console.clog('UPNP', 'add TCP mapping result',result)
                        if (this.wantUDP) {
                            this.addMapping(this.port, 'UDP', function(result) {
                                console.clog('UPNP', 'add UDP mapping result',result)
                                this.allDone(result)
                            })
                        } else {
                            this.allDone(result)
                        }
                    }.bind(this))
                }.bind(this))
            }.bind(this))
        },
        onDevice: function(info) {
            console.clog('UPNP', 'found an internet gateway device',info)
            var device = new GatewayDevice(info)
            device.getDescription( function() {
                this.devices.push( device )
            }.bind(this) )
        },
        getWANServiceInfo: function() {
            var infos = []
            for (var i=0; i<this.devices.length; i++) {
                var services = this.devices[i].getService(this.desiredServices)
                if (services.length > 0) {
                    for (var j=0; j<services.length; j++) {
                        infos.push( {service:services[j],
                                     device:this.devices[i]} )
                    }
                }
            }
            //console.log('found WAN services',infos)
            return infos
        },
        addMapping: function(port, prot, callback) {
            this.changeMapping(port, prot, 1, callback)
        },
        removeMapping: function(port, prot, callback) {
            this.changeMapping(port, prot, 0, callback)
        },
        changeMapping: function(port, prot, enabled, callback) {
            if (! this.validGateway) {
                callback()
            } else {
                function onresult(evt) {
                    if (evt.target.code == 200) {
                        var resp = evt.target.responseXML.documentElement.querySelector(enabled?'AddPortMappingResponse':'DeletePortMappingResponse')
                        if (resp) {
                            callback(flatParseNode(resp))
                        } else {
                            callback({error:'unknown',evt:evt})
                        }
                    } else {
                        // maybe parse out the error all nice?
                        callback({error:evt.target.code,evt:evt})
                    }
                }
                var externalPort = port
				if (enabled) {
					var args = [
						['NewEnabled',enabled],
						['NewExternalPort',externalPort],
						['NewInternalClient',this.getInternalAddress()],
						['NewInternalPort',port],
						['NewLeaseDuration',0],
						['NewPortMappingDescription',this.name],
						['NewProtocol',prot],
						['NewRemoteHost',""]
					]
				} else {
					var args = [
//						['NewEnabled',enabled],
						['NewExternalPort',externalPort],
//						['NewInternalClient',this.getInternalAddress()],
//						['NewInternalPort',port],
						['NewProtocol',prot],
						['NewRemoteHost',""]
					]
				}
                this.validGateway.device.runService(this.validGateway.service,
                                                    enabled?'AddPortMapping':'DeletePortMapping',
                                                    args, onresult)
            }
        },
        getMappings: function(callback) {
            if (! this.validGateway) {
                callback()
            } else {
                var info = this.validGateway
                var idx = 0
                var allmappings = []

                function oneResult(evt) {
                    if (evt.target.code == 200) {
                        var resp = evt.target.responseXML.querySelector("GetGenericPortMappingEntryResponse")
                        var mapping = flatParseNode(resp)
                        allmappings.push(mapping)
                        getOne()
                    } else {
                        callback(allmappings)
                    }
                }

                function getOne() {
                    info.device.runService(info.service, 'GetGenericPortMappingEntry', [['NewPortMappingIndex',idx++]], oneResult)
                }
                getOne()
            }
        },
        getIP: function(callback) {
            var infos = this.getWANServiceInfo()
            var foundIP = null
            var returned = 0

            function oneResult(info, evt) {
                var doc = evt.target.responseXML // doc undefined sometimes
                var ipelt = doc.documentElement.querySelector('NewExternalIPAddress')
                var ip = ipelt ? ipelt.innerHTML : null

                returned++
                info.device.externalIP = ip
                if (ip) {
                    foundIP = ip
                    this.validGateway = info
                }
                
                if (returned == infos.length) {
                    callback(foundIP)
                }
            }
            
            if (infos && infos.length > 0) {
                for (var i=0; i<infos.length; i++) {
                    var info = infos[i]
                    info.device.runService(info.service,'GetExternalIPAddress',[],oneResult.bind(this, info))
                }
            } else {
                callback(null)
            }
        }
    }
    
    function GatewayDevice(info) {
        this.info = info
        this.description_url = info.headers.location
        this.url = new URL(this.description_url)
        this.services = []
        this.devices = []
        this.attributes = null
        this.externalIP = null
    }
    GatewayDevice.prototype = {
        runService: function(service, command, args, callback) {
            var xhr = new WSC.ChromeSocketXMLHttpRequest
            var url = this.url.origin + service.controlURL
            var body = '<?xml version="1.0"?>' +
                '<s:Envelope ' +
                'xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
                's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
                '<s:Body>' +
                '<u:' + command + ' xmlns:u=' +
                JSON.stringify(service.serviceType) + '>' +
                args.map(function(args) {
                    return '<' + args[0]+ '>' +
                        (args[1] === undefined ? '' : args[1]) +
                        '</' + args[0] + '>';
                }).join('') +
                '</u:' + command + '>' +
                '</s:Body>' +
                '</s:Envelope>';
            //console.log('req body',body)
            var payload = new TextEncoder('utf-8').encode(body).buffer
            var headers = {
                'content-type':'text/xml; charset="utf-8"',
                'connection':'close',
                'SOAPAction': JSON.stringify(service.serviceType) + '#' + command
            }
            for (var k in headers) {
                xhr.setRequestHeader(k, headers[k])
            }
            xhr.open("POST",url)
            xhr.setRequestHeader('connection','close')
            xhr.responseType = 'xml'
            xhr.send(payload)
            xhr.onload = xhr.onerror = xhr.ontimeout = callback
        },
        getDescription: function(callback) {
            var xhr = new WSC.ChromeSocketXMLHttpRequest
            console.clog('UPNP','query',this.description_url)
            xhr.open("GET",this.description_url)
            xhr.setRequestHeader('connection','close')
            xhr.responseType = 'xml'
            function onload(evt) {
                if (evt.target.code == 200) {
                    var doc = evt.target.responseXML

                    var devices = doc.documentElement.querySelectorAll('device')
                    for (var i=0; i<devices.length; i++) {
                        this.devices.push( flatParseNode(devices[i]) )
                    }

                    var services = doc.documentElement.querySelectorAll('service')
                    for (var i=0; i<services.length; i++) {
                        this.services.push( flatParseNode(services[i]) )
                    }

                }
                //console.log('got service info',this)
                callback()
            }
            xhr.onload = xhr.onerror = xhr.ontimeout = onload.bind(this)
            xhr.send()
        },
        getService: function(desired) {
            var matches = this.services.filter( function(service) {
                return desired.indexOf(service.serviceType) != -1
            })
            return matches
        }
    }
    
    function SSDP(opts) {
        this.port = opts.port
        this.wantUDP = opts.udp === undefined ? true : opts.udp
		this.searchtime = opts.searchtime
        this.multicast = '239.255.255.250'
        this.ssdpPort = 1900
        this.boundPort = null
        this.searchdevice = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1'
        this._onReceive = this.onReceive.bind(this)
        chrome.sockets.udp.onReceive.addListener( this._onReceive )
        chrome.sockets.udp.onReceiveError.addListener( this._onReceive )
        this.sockMap = {}
        this.lastError = null
        this.searching = false
        this._event_listeners = {}
    }

    SSDP.prototype = {
        addEventListener: function(name, callback) {
            if (! this._event_listeners[name]) {
                this._event_listeners[name] = []
            }
            this._event_listeners[name].push(callback)
        },
        trigger: function(name, data) {
            var cbs = this._event_listeners[name]
            if (cbs) {
                cbs.forEach( function(cb) { cb(data) } )
            }
        },
        onReceive: function(result) {
            var state = this.sockMap[result.socketId]
            var resp = new TextDecoder('utf-8').decode(result.data)
            if (! (resp.startsWith("HTTP") || resp.startsWith("NOTIFY"))) { return }
            var lines = resp.split('\r\n')
            var headers = {}
            // Parse headers from lines to hashmap
            lines.forEach(function(line) {
                line.replace(/^([^:]*)\s*:\s*(.*)$/, function (_, key, value) {
                    headers[key.toLowerCase()] = value;
                });
            })
            if (headers.st == this.searchdevice) {
                //console.log('SSDP response',headers,result)
                var device = {
                    remoteAddress: result.remoteAddress,
                    remotePort: result.remotePort,
                    socketId: 977,
                    headers: headers
                }
                this.trigger('device',device)
            }
        },
        error: function(data) {
            this.lastError = data
            console.clog('UPNP', "error",data)
            this.searching = false
            // clear out all sockets in sockmap
            this.cleanup()
            if (this.allDone) this.allDone(false)
        },
        cleanup: function() {
            for (var socketId in this.sockMap) {
                chrome.sockets.udp.close(parseInt(socketId))
            }
            this.sockMap = {}
            chrome.sockets.udp.onReceive.removeListener( this._onReceive )
            chrome.sockets.udp.onReceiveError.removeListener( this._onReceive )
        },
        stopsearch: function() {
            console.clog('UPNP', "stopping ssdp search")
            // stop searching, kill all sockets
            this.searching = false
            this.cleanup()
            this.trigger('stop')
        },
        search: function(opts) {
            if (this.searching) { return }
            setTimeout( this.stopsearch.bind(this), this.searchtime )
            var state = {opts:opts}
            chrome.sockets.udp.create(function(sockInfo) {
                state.sockInfo = sockInfo
                this.sockMap[sockInfo.socketId] = state
                chrome.sockets.udp.setMulticastTimeToLive(sockInfo.socketId, 1, function(result) {
                    if (result < 0) {
                        this.error({error:'ttl',code:result})
                    } else {
                        chrome.sockets.udp.bind(state.sockInfo.socketId, '0.0.0.0', 0, this.onbound.bind(this,state))
                    }
                }.bind(this))
            }.bind(this))
        },
        onbound: function(state,result) {
            if (result < 0) {
                this.error({error:'bind error',code:result})
                return
            }
            chrome.sockets.udp.getInfo(state.sockInfo.socketId, this.onInfo.bind(this,state))
        },
        onInfo: function(state, info) {
			var lasterr = chrome.runtime.lastError
			if (lasterr) {
				// socket was deleted in the meantime?
				this.error(lasterr)
				return
			}
            this.boundPort = info.localPort
            //console.clog('UPNP','bound')
            chrome.sockets.udp.joinGroup(state.sockInfo.socketId, this.multicast, this.onjoined.bind(this,state))
        },
        onjoined: function(state, result) {
            var lasterr = chrome.runtime.lastError
            if (lasterr) {
                this.error(lasterr)
                return
            }
            if (result < 0) {
                this.error({error:'join multicast',code:result})
                return
            }
            var req = 'M-SEARCH * HTTP/1.1\r\n' +
                'HOST: ' + this.multicast + ':' + this.ssdpPort + '\r\n' +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 1\r\n' +
                'ST: ' + this.searchdevice + '\r\n' +
                '\r\n'

            chrome.sockets.udp.send(state.sockInfo.socketId, new TextEncoder('utf-8').encode(req).buffer, this.multicast, this.ssdpPort, this.onsend.bind(this))
            //console.clog('UPNP', 'sending to',this.multicast,this.ssdpPort)
        },
        onsend: function(result) {
            //console.clog('UPNP', 'sent result',result)
        }
    }
    WSC.UPNP = UPNP
})();
