function Conn(url) {
	this.url = url
	this.ws = new WebSocket(url)
	console.log('new ws',this.ws,'url')
	this.ws.onopen = this.onopen.bind(this)
	this.ws.onclose = this.onclose.bind(this)
	this.ws.onerror = this.onerror.bind(this)
	this.ws.onmessage = this.onmessage.bind(this)
	this.connected = false
	this.closed = false
}
Conn.prototype = {
	onopen: function() {
		console.log('ws open')
		this.ws.send('hello')
		this.connected = true
	},
	onclose: function() {
		console.log('ws close')
		this.connected = false
		this.closed = true
	},
	onerror: function() {
		console.log('ws error')
		this.connected = false
		this.closed = true
	},
	onmessage: function(msg) {
		console.log('ws message',msg)
	}
}

var conn = new Conn('ws://127.0.0.1:8887/ws')
//var conn = new Conn('ws://127.0.0.1:8080/ws')
