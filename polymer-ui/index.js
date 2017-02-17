var reload = chrome.runtime.reload
document.addEventListener("DOMContentLoaded",ondom)
function getel(id) { return document.getElementById(id) }

function ui_ready() {
    getel('main-loading').style.display = 'none'
    getel('main-content').style.display = 'block'

    if (window.webapp) {
        if (! (webapp.started || webapp.starting)) {
            // autostart ?
            webapp.start()
        }
    }
}
function settings_ready() {
    //window.localOptions = d
    var allOpts = appOptions.getAll()
    console.log('fetched local settings',appOptions, allOpts)
    window.webapp = bg.get_webapp(allOpts) // retainStr in here
    bg.WSC.VERBOSE = bg.WSC.DEBUG = appOptions.get('optVerbose')
    create_polymer_elements()
    on_webapp_change()
    webapp.on_status_change = on_webapp_change
    setup_events()
    ui_ready()
}
function ondom() {
    chrome.runtime.getBackgroundPage( function(bg) {
        window.appOptions = new window.AppOptions(settings_ready)
        window.bg = bg
    })
}

function get_status() {
    return {
        starting: webapp.starting,
        started: webapp.started,
        lasterr: webapp.lasterr,
        folder: webapp.fs &&
            webapp.fs.entry &&
            webapp.fs.entry.fullPath
    }
}

function on_webapp_change() {
    var status = get_status()
    console.log('webapp changed',status)

    var c = document.getElementsByTagName('wsc-controls')[0]
    // window could be undefined if suspend event?
    if (window) {
        window.wc = c

        c.set('interfaces', webapp.urls.slice()) // why have to slice???
        c.set('port', webapp.port)
        c.set('folder', status.folder)
        c.set('started', webapp.started)
        c.set('starting', webapp.starting)
        c.set('lasterr', webapp.lasterr)
    }

}

function setup_events() {
    function keydown(evt) {
        if (evt.metaKey || evt.ctrlKey) {
            if (evt.keyCode == 82) {
                // ctrl-r
                console.log('received ctrl(meta)-r, reload app')
                if (window.fgapp) {
                    fgapp.reload()
                } else {
                    chrome.runtime.reload()
                }
            }
            //evt.preventDefault() // dont prevent ctrl-w
        }
    }
    document.body.addEventListener('keydown', keydown)


    
    document.getElementById('help-icon').addEventListener('click', function(evt) {
        document.getElementById('help-dialog').open()
    })
}

function create_polymer_elements() {
    if (! window.Polymer) {
        document.getElementById('polymerWarning').style.display = 'block'
    }
    Polymer({
        is: 'wsc-controls',
        properties: {
            interfaces: { type: Array,
                          value: [] },
            started: Boolean,
            starting: Boolean,
            lasterr: '??',
            folder: {type:String, value:'No folder selected'},
            port: {type:Number, value:6669},
            state: { type: String,
                     computed: 'computeState(started, starting, lasterr)' }
        },
        displayFolder: function(folder) {
            if (! folder) {
                return "NO FOLDER SELECTED"
            } else {
                return folder
            }
        },
        computeState: function(started, starting, lasterr) {
            if (lasterr) {
                return JSON.stringify(lasterr)
            } else if (starting) {
                return 'STARTING'
            } else if (started) {
                return 'STARTED'
            } else {
                return 'STOPPED'
            }
        },
        ready: function() {
            console.log('wsc-controls ready')
        },
        onChooseFolder: function() {
            console.log('clicked choose folder')
            function onfolder(folder) {
                bg.onchoosefolder(folder)
            }
            chrome.fileSystem.chooseEntry({type:'openDirectory'}, onfolder)
        },
        onStartStop: function(evt) {
            if (! this.$$('#start-stop').active) { // changes before on-click
                console.log('stopping webapp')
                webapp.stop()
            } else {
                console.log('starting webapp')
                webapp.start()
            }
        }
    })

    Polymer({
        is: 'wsc-options',
        properties: {
			showAdvanced: { type: Boolean,
							value: false },
            port: { type: Number,
                    value: webapp.port },
            optAllInterfaces: {
                type: Boolean,
                observer: 'interfaceChange',
                value: appOptions.get('optAllInterfaces')
            },
            optDoPortMapping: {
                observer: 'portmapChange',
                type: Boolean,
                value: appOptions.get('optDoPortMapping')
            },
            optIPV6: {
                type: Boolean,
				observer: 'optIPV6Change',
                value: appOptions.get('optIPV6')
            },
            optVerbose: {
                type: Boolean,
				observer: 'optVerboseChange',
                value: appOptions.get('optVerbose')
            },
            optCORS: {
                type: Boolean,
				observer: 'optCORSChange',
                value: appOptions.get('optCORS')
            },
            optStatic: {
                type: Boolean,
				observer: 'optStaticChange',
                value: appOptions.get('optStatic')
            },
            optUpload: {
                type: Boolean,
				observer: 'optUploadChange',
                value: appOptions.get('optUpload')
            },
            optTryOtherPorts: {
                type: Boolean,
                value: false
            },
            optStopIdleServer: { // ms until stop inactive server
                type: Number,
                value: 0
            },
            optRetryInterfaces: {
                type: Boolean,
                value: true
            },
            optPreventSleep: {
                type: Boolean,
                observer: 'preventSleepChange',
                value: appOptions.get('optPreventSleep')
            },
            optBackground: {
                type: Boolean,
                observer: 'backgroundChange',
                value: appOptions.get('optBackground')
            },
            optAutoStart: {
                type: Boolean,
                observer: 'autoStartChange',
                value: appOptions.get('optAutoStart')
            },
            optRenderIndex: {
                type: Boolean,
                observer: 'optRenderIndexChange',
                value: appOptions.get('optRenderIndex')
            },
            optModRewriteEnable: {
                type: Boolean,
                observer: 'optModRewriteEnableChange',
                value: appOptions.get('optModRewriteEnable')
            },
            optModRewriteRegexp: {
                type: String,
                observer: 'optModRewriteRegexpChange',
                value: appOptions.get('optModRewriteRegexp')
            },
            optModRewriteNegate: {
                type: Boolean,
                observer: 'optModRewriteNegateChange',
                value: appOptions.get('optModRewriteNegate')
            },
            optModRewriteTo: {
                type: String,
                observer: 'optModRewriteToChange',
                value: appOptions.get('optModRewriteTo')
            }
        },
        optModRewriteEnableChange: function(val) {
			var k = 'optModRewriteEnable'
			this.updateAndSave(k,val)
        },
        optModRewriteNegateChange: function(val) {
			var k = 'optModRewriteNegate'
			this.updateAndSave(k,val)
        },
        optModRewriteToChange: function(val) {
			var k = 'optModRewriteTo'
			this.updateAndSave(k,val)
        },
        optModRewriteRegexpChange: function(val) {
			var k = 'optModRewriteRegexp'
			this.updateAndSave(k,val)
        },
		optStaticChange: function(val) {
			var k = 'optStatic'
			this.updateAndSave(k,val)
		},
		optUploadChange: function(val) {
			var k = 'optUpload'
			this.updateAndSave(k,val)
		},
		optCORSChange: function(val) {
			var k = 'optCORS'
			this.updateAndSave(k,val)
		},
		optVerboseChange: function(val) {
			var k = 'optVerbose'
			this.updateAndSave(k,val)
            bg.WSC.VERBOSE = bg.WSC.DEBUG = val
		},
		optIPV6Change: function(val) {
			var k = 'optIPV6'
			this.updateAndSave(k,val)
		},
		updateAndSave: function(k,v) {
			console.log('update and save',k,v)
			webapp.updateOption(k,v)
			appOptions.set(k,v)
		},
        ready: function() {
            console.log('wsc-options ready')
			window.opts = this
        },
		attributeChanged: function(name, type) {
			console.log("attribute change",name,type)
		},
		propertyObserver: function() {
			console.log('property observer',arguments)
		},
        portmapChange: function(val) {
            console.log('persist setting portmapping',val)
            webapp.updateOption('optDoPortMapping',val)
            appOptions.set('optDoPortMapping',val)
        },
        interfaceChange: function(val) {
            console.log('persist setting interface',val)
            webapp.opts.optAllInterfaces = val
            webapp.interfaces = []
            appOptions.set('optAllInterfaces',val)
        },
		toggleShowAdvanced: function(evt) {
			this.showAdvanced = ! this.showAdvanced
			evt.preventDefault()
		},
        preventSleepChange: function(val) {
            /*
              maybe make power an optional permission? only, it is automatically granted without user gesture... 
            */
            console.log('persist setting prevent sleep',val)
            webapp.opts.optPreventSleep = val
            webapp.updatedSleepSetting()
            appOptions.set('optPreventSleep',val)
        },
        autoStartChange: function(val) {
            console.log('persist setting autostart')
            appOptions.set('optAutoStart', val)
            bg.backgroundSettingChange({'optAutoStart':val})
        },
        backgroundChange: function(val) {
            console.log('background setting changed',val)
			webapp.updateOption('optBackground',val)
            appOptions.set('optBackground', val)
            bg.backgroundSettingChange({'optBackground':val})
        },
        optRenderIndexChange: function(val) {
            console.log('persist setting renderIndex')
            webapp.opts.optRenderIndex = val
            appOptions.set('optRenderIndex',val)
        },
        onPortChange: function() {
			var val = this.port
            var port = parseInt(val)
            console.log('persist port',port)
            webapp.opts.port = port
            webapp.port = port
            appOptions.set('port',port)
        },
		onClickStartBackground: function(evt) {
			var val = this.$$('#start-background').active
			if (val) {
				chrome.permissions.request({permissions:['background']}, function(result) {
					console.log('request perm bg',result)
					if (result) {
						success()
					}
				})
			} else {
				chrome.permissions.remove({permissions:['background']}, function(result) {
					console.log('drop perm bg',result)
					success()
				})
			}
			function success() {
				console.log('persist setting start in background',val)
				webapp.opts.optBackground = val
				appOptions.set('optBackground',val)
				bg.backgroundSettingChange({'optBackground':val})
			}
		}

    })
}
