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
    console.log('fetched local settings',appOptions)
    window.webapp = bg.get_webapp(appOptions.getAll()) // retainStr in here
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
            port: { type: Number,
                    value: webapp.port },
            optAllInterfaces: {
                type: Boolean,
                observer: 'interfaceChange',
                value: appOptions.options['optAllInterfaces']
            },
            optDoPortMapping: {
                observer: 'portmapChange',
                type: Boolean,
                value: appOptions.options['optDoPortMapping']
            },
            optIPV6: {
                type: Boolean,
                value: appOptions.options['optIPV6']
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
                value: appOptions.options['optPreventSleep']
            },
            optBackground: {
                type: Boolean,
                observer: 'backgroundChange',
                value: appOptions.options['optBackground']
            },
            optAutoStart: {
                type: Boolean,
                observer: 'autoStartChange',
                value: appOptions.options['optAutoStart']
            },
            optRenderIndex: {
                type: Boolean,
                observer: 'optRenderIndexChange',
                value: appOptions.options['optRenderIndex']
            }
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
            webapp.opts.optAutoStart = val
            appOptions.set('optAutoStart', val)
            bg.backgroundSettingChange({'optAutoStart':val})
        },
        backgroundChange: function(val) {
            console.log('persist setting background')
            webapp.opts.optBackground = val
            appOptions.set('optBackground',val)
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
        }
    })
}
