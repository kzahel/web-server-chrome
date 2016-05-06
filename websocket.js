(function() {
	

	function WebSocketHandler() {
		WSC.BaseHandler.prototype.constructor.call(this)

		this.ws_connection = null
		this.close_code = null
		this.close_reason = null
		this.stream = null
		this._on_close_called = false

	}
	WebSocketHandler.prototype = {
		get: function() {
			if (this.getHeader('upgrade','').toLowerCase() != 'websocket') {
				console.log('connection must be upgrade')
				this.set_status(400)
				this.finish()
				return
			}
			var origin = this.getHeader('origin')
			if (! this.check_origin(origin)) {
				console.log("origin mismatch")
				this.set_status(403)
				this.finish()
				return
			}
			this.stream = this.request.connection.stream // detach() ?
			this.stream.set_close_callback(this.on_connection_close.bind(this))
			this.ws_connection = new WebSocketProtocol(this)
			this.ws_connection.accept_connection()
		},
		write_message: function(message, binary) {
			binary = binary || false
			if (! this.ws_connection) {
				throw new Error("Websocket not connected")
			} else {
				this.ws_connection.write_message(message, binary)
			}
		},
		select_subprotocols: function(subprots) {
		},
		get_compression_options: function() {
		},
		ping: function(data) {
			console.assert( this.ws_connection )
			this.ws_connection.write_ping(data)
		},
		on_pong: function(data) {
		},
		on_close: function() {
		},
		close: function(code,reason) {
			if (this.ws_connection) {
				this.ws_connection.close(code,reason)
				this.ws_connection = null
			}
		},
		set_nodelay: function(val) {
			this.stream.set_nodelay(val)
		},
		on_connection_close: function() {
			if (this.ws_connection) {
				this.ws_connection.on_connection_close()
				this.ws_connection = null
			}
			if (! this._on_close_called) {
				this._on_close_called = true
				this.on_close()
			}
		},
		send_error: function(opts) {
			if (this.stream) {
				this.stream.close()
			} else {
				// XXX bubble up to parent ?
				// dont have super()
				debugger
			}
		},
		check_origin: function(origin) {
			return true
		}
	}
	for (var m in WSC.BaseHandler.prototype) {
		WebSocketHandler.prototype[m] = WSC.BaseHandler.prototype[m]
	}

	var WSPROT = {
		FIN: 0x80,
		RSV1: 0x40,
		RSV2: 0x20,
		RSV3: 0x10,
		OPCODE_MASK: 0x0f,
		MAGIC: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	}
	WSPROT.RSV_MASK = WSPROT.RSV1 | WSPROT.RSV2 | WSPROT.RSV3
	

	function compute_accept_value(key, cb) {
		// sha1 hash etc
		var keybuf = new TextEncoder('utf-8').encode(key)
		var magicbuf = new TextEncoder('utf-8').encode(WSPROT.MAGIC)
		var buf = new Uint8Array(keybuf.length + WSPROT.MAGIC.length)
		buf.set(keybuf, 0)
		buf.set(magicbuf, keybuf.length)
        crypto.subtle.digest({name:'SHA-1'}, buf).then( function(result) {
			var d = btoa(WSC.ui82str(new Uint8Array(result)))
			cb(d)
        })
	}


	function _websocket_mask(mask, data) {
		// mask is 4 bytes, just keep xor with it
		var v = new Uint8Array(data)
		var m = new Uint8Array(mask)
		for (var i=0; i<v.length; i++) {
			v[i] ^= m[i % 4]
		}
		return v.buffer
	}

	function WebSocketProtocol(handler, opts) {
		opts = opts || {}
		opts.mask_outgoing = opts.mask_outgoing || false
		opts.compression_options = opts.compression_options || null
		
		this.handler = handler
		this.request = handler.request
		this.stream = handler.stream
		this.client_terminated = false
		this.server_terminated = false

		// WSprotocol 13
		this.mask_outgoing = opts.mask_outgoing
		this._final_frame = false
		this._frame_opcode = null
        this._masked_frame = null
		this._frame_mask = null
		this._frame_length = null
		this._fragmented_message_buffer = null
		this._fragmented_message_opcode = null
		this._waiting = null
		this._compression_options = opts.compression_options
		this._decompressor = null
		this._compressor = null
		this._frame_compressed = null

		this._messages_bytes_in = 0
		this._messages_bytes_out = 0

		this._wire_bytes_out = 0
		this._wire_bytes_out = 0
	}
	WebSocketProtocol.prototype = {

		accept_connection: function() {
			// TODO add trycatch with abort
			var valid = this._handle_websocket_headers()
			if (! valid) { return this._abort() }
			this._accept_connection()
		},
		_challenge_response: function() {
			return new Promise( function(resolve,reject) {
				compute_accept_value(this.request.headers['sec-websocket-key'], function(resp) {
					resolve(resp)
				}.bind(this))
			}.bind(this))
		},
		_accept_connection: function() {
			var subprot_header = ''
			var subprots = this.request.headers['sec-websocket-protocol'] || '' 
			subprots = subprots.split(',').map(function(s){ return s.trim() })
			if (subprots.length > 0) {
				var selected = this.handler.select_subprotocols(subprots)
				if (selected) {
					var subprot_header = 'Sec-Websocket-Protocol: ' + selected + '\r\n'
				}
			}
			var ext_header = ''
			var exts = this._parse_extensions_header(this.request.headers)
			for (var i=0; i<exts.length; i++) {
				var ext = exts[i]
				if (ext[0] == 'permessage-deflate' && this._compression_options) {
					this._create_compressors('server',ext[1])
					if (ext[1]['client_max_window_bits'] !== undefined &&
						ext[1]['client_max_window_bits'] === null) {
						delete ext[1]['client_max_window_bits']
					}
					ext_header = 'Sec-Websocket-Extensions: ' + WSC.encode_header(permessage-deflate, ext[1])
					break
				}
			}
			console.assert( ext_header == '') // parsing not working yet

			
			if (this.stream.closed) {
				this._abort()
				return
			}

			this._challenge_response().then( function(response) {
				var headerlines = ["HTTP/1.1 101 Switching Protocols",
								   "Upgrade: websocket",
								   "Connection: Upgrade",
								   "Sec-WebSocket-Accept: " + response,
								   subprot_header + ext_header]
				var headers = headerlines.join('\r\n') + '\r\n'
				this.stream.write(new TextEncoder('utf-8').encode(headers).buffer)
				this.handler.open()
				this._receive_frame()
			}.bind(this))
		},
		_parse_extensions_header: function(headers) {
			var exts = headers['sec-websocket-extensions'] || ''
			if (exts) {
				//var keys = exts.split(';').map(function(s) { return s.trim() }) // broken need WSC.parse_header
				//return keys
				return []
				// NEI
			} else {
				return []
			}
		},
		_process_server_headers: function() {
			debugger
		},
		_get_compressor_options: function(side, agreed_params) {
			debugger
		},
		_create_compressors: function(side, agreed_params) {
		},
		_write_frame: function(fin, opcode, data, flags) {
			flags = flags | 0
			var b
			var finbit = fin ? WSPROT.FIN : 0
			var frame = []
			b = new Uint8Array(1)
			b[0] = finbit | opcode | flags
			frame.push(b)
			var l = data.byteLength
			var mask_bit = this.mask_outgoing ? 0x80 : 0
			if (l < 126) {
				b = new Uint8Array(1)
				b[0] = l | mask_bit
			} else if (l <= 0xffff) {
				b = new Uint8Array(3)
				b[0] = 126 | mask_bit
				new DataView(b.buffer).setUint16(1, l)
			} else {
				b = new Uint8Array(9)
				b[0] = 127 | mask_bit
				new DataView(b.buffer).setUint32(5, l)
			}
			frame.push(b)
			if (this.mask_outgoing) {
				var mask = new Uint8Array(4)
				crypto.getRandomValues(mask)
				frame.push(mask)
				frame.push(_websocket_mask(mask, data))
			} else {
				frame.push(data)
			}
			for (var i=0; i<frame.length; i++) {
				this.stream.writeBuffer.add( frame[i].buffer || frame[i] )
			}
			this.stream.tryWrite()
		},
		write_message: function(message, binary) {
			var opcode = binary ? 0x2 : 0x1
			if (binary) {
				if (message instanceof ArrayBuffer) {
					msgout = message
				} else {
					var msgout = new TextEncoder('utf-8').encode(message).buffer
				}
			} else {
				var msgout = new TextEncoder('utf-8').encode(message).buffer
			}
			this._messages_bytes_out += message.byteLength
			var flags = 0
			if (this._compressor) {
				debugger
			}
			this._write_frame(true, opcode, msgout, flags)
		},
		write_ping: function(data) {
			console.assert(data instanceof ArrayBuffer)
			this._write_frame(true,0x9,data)
		},
		_receive_frame: function() {
			this.stream.readBytes(2, this._on_frame_start.bind(this))
			// XXX have this throw exception if stream is closed on read event
		},
		_on_frame_start: function(data) {
			//console.log('_on_frame_start',data.byteLength)
			this._wire_bytes_in += data.byteLength
			var v = new DataView(data,0,2)
			var header = v.getUint8(0)
			var payloadlen = v.getUint8(1)
			this._final_frame = header & WSPROT.FIN
			var reserved_bits = header & WSPROT.RSV_MASK
			this._frame_opcode = header & WSPROT.OPCODE_MASK
			this._frame_opcode_is_control = this._frame_opcode & 0x8
			if (this._decompressor && this._frame_opcode != 0) {
				debugger
				// not yet supported
				return
			}
			if (reserved_bits) {
				this._abort()
				return
			}
			this._masked_frame = !!(payloadlen & 0x80)
			payloadlen = payloadlen & 0x7f
			if (this._frame_opcode_is_control && payloadlen >= 126) {
				//console.log('control frames must have payload < 126')
				this._abort()
				return
			}
			//todo try/catch read and abort
			if (payloadlen < 126) {
				//console.log('payloadlen < 126')
				this._frame_length = payloadlen
				if (this._masked_frame) {
					//console.log('masked frame')
					this.stream.readBytes(4, this._on_masking_key.bind(this) )
				} else {
					//console.log('simple frame of len', this._frame_length)
					this.stream.readBytes(this._frame_length, this._on_frame_data.bind(this) )
				}
			} else if (payloadlen == 126) {
				this.stream.readBytes(2, this._on_frame_length_16.bind(this))
			} else if (payloadlen == 127) {
				this.stream.readBytes(8, this._on_frame_length_64.bind(this))
			}
		},
		_on_frame_length_16: function(data) {
			//console.log('_on_frame_length_16',data.byteLength)
			this._wire_bytes_in += data.byteLength
			var v = new DataView(data,0,2)
			this._frame_length = v.getUint16(0)
			this._on_frame_length_n(data)
		},
		_on_frame_length_64: function(data) {
			this._wire_bytes_in += data.byteLength
			var v = new DataView(data,0,8)
			this._frame_length = v.getUint32(4)
			this._on_frame_length_n(data)
		},
		_on_frame_length_n: function(data) {
			// todo trycatch abort
			if (this._masked_frame) {
				//console.log('masked frame')
				this.stream.readBytes(4, this._on_masking_key.bind(this))
			} else {
				this.stream.readBytes(this._frame_length, this._on_frame_data.bind(this))
			}
		},
		_on_masking_key: function(data) {
			this._wire_bytes_in += data.byteLength
			//console.log('frame mask', new Uint8Array(data))
			this._frame_mask = data
			// todo try/catch
			this.stream.readBytes(this._frame_length, this._on_masked_frame_data.bind(this))
		},
		_on_masked_frame_data: function(data) {
			this._on_frame_data(_websocket_mask(this._frame_mask, data))
		},
		_on_frame_data: function(data) {
			//console.log('_on_frame_data',data.byteLength)
			var opcode
			this._wire_bytes_in += data.byteLength
			if (this._frame_opcode_is_control) {
				if (! this._final_frame) {
					this._abort()
					return
				}
				opcode = this._frame_opcode
			} else if (this._frame_opcode == 0) { // continuation
				if (! this._fragmented_message_buffer) {
					this._abort()
					return
				}
				this._fragmented_message_buffer.push(data)
				if (this._final_frame) {
					opcode = this._fragmented_message_opcode
					console.warn
					data = this._fragmented_message_buffer // join ?
					this._fragmented_message_buffer = null
				}
			} else {
				if (this._fragmented_message_buffer) {
					this._abort()
					return
				}
				if (this._final_frame) {
					opcode = this._frame_opcode
				} else {
					this._fragmented_message_opcode = this._frame_opcode
					this._fragmented_message_buffer = [data]
				}
			}

			if (this._final_frame)
				this._handle_message(opcode, data)
			if (! this.client_terminated)
				this._receive_frame()
		},
		_handle_message: function(opcode, data) {
			if (this.client_terminated)
				return

			if (this._frame_compressed) debugger

			if (opcode == 0x1) { // utf-8
				this._messages_bytes_in += data.byteLength
				var s = new TextDecoder('utf-8').decode(data)
				// todo try/catch and abort
				this._run_callback(this.handler.on_message, this.handler, s)
			} else if (opcode == 0x2) { // binary
				this._messages_bytes_in += data.byteLength 
				this._run_callback(this.handler.on_message, this.handler, data)
			} else if (opcode == 0x8) { // close
				this.client_terminated = true
				if (data.byteLength >= 2) {
					var v = new DataView(data,0,2)
					this.handler.close_code = v.getUint16(0)
				}
				if (data.byteLength > 2) {
					this.handler.close_reason = new TextDecoder('utf-8').decode(data.slice(2,data.byteLength))
				}
				this.close(this.handler.close_code)
			} else if (opcode == 0x9) { // ping
				this._write_frame(true, 0xA, data)
			} else if (opcode == 0xa) {
				this._run_callback(this.handler.on_pong, this.handler, data)
			} else {
				this._abort()
			}
		},
		close: function(code, reason) {
			if (! this.server_terminated) {
				if (! this.stream.closed) {
					var close_data
					if (! code && reason) {
						code = 1000 // normal closure
					}
					if (! code && code !== 0) {
						close_data = new ArrayBuffer(0)
					} else {
						var b = new ArrayBuffer(2)
						var v = new DataView(b)
						v.setUint16(0, code)
						close_data = b
					}
					if (reason) {
						var extra = new TextEncoder('utf-8').encode(reason)
						var arr = new Uint8Array(close_data.byteLength + extra.length)
						arr.set(close_data, 0)
						arr.set(extra, close_data.byteLength)
						close_data = arr.buffer
					}
					this._write_frame(true, 0x8, close_data)
				}
				this.server_terminated = true
			}
			if (this.client_terminated) {
				if (this._waiting) {
					clearTimeout(this._waiting)
					this._waiting = null
				}
			} else if (! this._waiting) {
				// wait for a bit and then call _abort()
				this._waiting = setTimeout( function() {
					this._abort()
				}.bind(this), 5)
			}
		},
		_handle_websocket_headers: function() {
			var fields = ["host","sec-websocket-key", "sec-websocket-version"]
			for (var i=0; i<fields.length; i++) {
				if (! this.request.headers[fields[i]]) {
					return false
				}
			}
			return true
		},
		on_connection_close: function() {
			this._abort()
		},
		_run_callback: function(callback, ctx) {
			callback.apply(ctx, Array.prototype.slice.call(arguments, 2, arguments.length))
			// catch an exception and abort if we have one.
		},
		_abort: function() {
			this.client_terminated = true
			this.server_terminated = true
			this.stream.close()
			this.close() // subclass cleanup
		}
	}


	function ExampleWebSocketHandler() {
		WebSocketHandler.prototype.constructor.call(this)
	}
	ExampleWebSocketHandler.prototype = {
		open: function() {
			console.log('websocket handler handler.open()')
			window.ws = this
			//this.write_message("hello!")
		},
		on_message: function(msg) {
			console.log('got ws message',msg,msg.byteLength, new Uint8Array(msg))
			//this.write_message('pong')
		},
		on_close: function() {
			debugger
		}
	}
	for (var m in WebSocketHandler.prototype) {
		ExampleWebSocketHandler.prototype[m] = WebSocketHandler.prototype[m]
	}

	WSC.ExampleWebSocketHandler = ExampleWebSocketHandler
	WSC.WebSocketHandler = WebSocketHandler
	
})();
