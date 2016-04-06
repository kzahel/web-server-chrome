var reload = chrome.runtime.reload
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
function settings_ready(d) {
    window.localOptions = d
    console.log('fetched local settings',d)
    window.webapp = bg.get_webapp(d) // retainStr in here
    create_polymer_elements()
    on_webapp_change()
    webapp.on_status_change = on_webapp_change
    setup_events()
    ui_ready()
}

chrome.runtime.getBackgroundPage( function(bg) {
    window.bg = bg
    chrome.storage.local.get(null, settings_ready)
})

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
                value: localOptions['optAllInterfaces']
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
                value: localOptions['optPreventSleep']
            },
            optBackground: {
                type: Boolean,
                observer: 'backgroundChange',
                value: localOptions['optBackground']
            },
            optAutoStart: {
                type: Boolean,
                observer: 'autoStartChange',
                value: localOptions['optAutoStart']
            },
            optRenderIndex: {
                type: Boolean,
                observer: 'optRenderIndexChange',
                value: localOptions['optRenderIndex']
            }
        },
        interfaceChange: function(val) {
            console.log('persist setting interface')
            webapp.opts.optAllInterfaces = this.optAllInterfaces
            webapp.interfaces = []
            chrome.storage.local.set({'optAllInterfaces':this.optAllInterfaces})
        },
        preventSleepChange: function(val) {
            /*
              maybe make power an optional permission? only, it is automatically granted without user gesture... 
            */
            console.log('persist setting prevent sleep')
            webapp.opts.optPreventSleep = this.optPreventSleep
            webapp.updatedSleepSetting()
            chrome.storage.local.set({'optPreventSleep':this.optPreventSleep})
        },
        autoStartChange: function(val) {
            console.log('persist setting autostart')
            webapp.opts.optAutoStart = this.optAutoStart
            chrome.storage.local.set({'optAutoStart':this.optAutoStart})
            bg.backgroundSettingChange({'optAutoStart':this.optAutoStart})
        },
        backgroundChange: function(val) {
            console.log('persist setting background')
            webapp.opts.optBackground = this.optBackground
            chrome.storage.local.set({'optBackground':this.optBackground})
            bg.backgroundSettingChange({'optBackground':this.optBackground})
        },
        optRenderIndexChange: function(val) {
            console.log('persist setting renderIndex')
            webapp.opts.optRenderIndex = this.optRenderIndex
            chrome.storage.local.set({'optRenderIndex':this.optRenderIndex})
        },
        onPortChange: function(val) {
            var port = parseInt(this.port)
            console.log('persist port',port)
            webapp.opts.port = port
            webapp.port = port
            chrome.storage.local.set({'port':port})
        }
    })
}
