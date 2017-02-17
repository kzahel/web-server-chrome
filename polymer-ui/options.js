(function() {
	// lol that these are duplicated in the polymer element
	var options = {
        port: {
            name: "Port",
            type: Number,
            default: 8887
        },
        optAllInterfaces: {
            type: Boolean,
            default: false
        },
        optDoPortMapping: {
            type: Boolean,
            default: false
        },
        optIPV6: {
            type: Boolean,
            default: false
        },
        optCORS: {
            type: Boolean,
            default: false
        },
        optVerbose: {
            type: Boolean,
            default: false
        },
        optStatic: {
            type: Boolean,
            default: false
        },
        optTryOtherPorts: {
            type: Boolean,
            default: false
        },
        optRetryInterfaces: {
            type: Boolean,
            visible: false,
            default: true
        },
        optPreventSleep: {
            type: Boolean,
            default: false
        },
        optBackground: {
            type: Boolean,
            default: false
        },
        optAutoStart: {
            type: Boolean,
            default: false
        },
        optRenderIndex: {
            type: Boolean,
            default: true
        },
        optUpload: {
            type: Boolean,
            default: false
        },
        optModRewriteEnable: {
            type: Boolean,
            default: false
        },
        optModRewriteRegexp: {
            type: String,
            default: ".*\\.[\\d\\w]+$" // looks like a file extension
        },
        optModRewriteNegate: {
            type: Boolean,
            default: true
        },
        optModRewriteTo: {
            type: String,
            default: '/index.html'
        }
	}

	function Options(callback) {
		this.meta = options
		this.options = null

		chrome.storage.local.get(null, function(d) {
			this.options = d
			// update options with default options
			callback()
		}.bind(this))
	}
	Options.prototype = {
		get: function(k) {
			if (this.options[k] !== undefined) return this.options[k]
			return this.meta[k].default
		},
		getAll: function() {
			var d = {}
			Object.assign(d, this.options)
			for (var key in this.meta) {
				if (d[key] === undefined && this.meta[key].default !== undefined) {
					d[key] = this.meta[key].default
				}
			}
			return d
		},
		set: function(k,v) {
			this.options[k] = v
			var d = {}
			d[k] = v
			chrome.storage.local.set(d, function(){})
		}
	}
	window.AppOptions = Options

})()
