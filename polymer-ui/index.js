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
    window.webapp = bg.get_webapp(d)
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
        folder: bg.WSC.DirectoryEntryHandler.fs &&
            bg.WSC.DirectoryEntryHandler.fs.entry &&
            bg.WSC.DirectoryEntryHandler.fs.entry.fullPath
    }
}

function on_webapp_change() {
    var status = get_status()
    console.log('webapp changed',status)

    var c = document.getElementsByTagName('wsc-controls')[0]
    window.wc = c

    c.set('interfaces', webapp.urls.slice()) // why have to slice???
    c.set('port', webapp.port)
    c.set('folder', status.folder)
    c.set('started', webapp.started)
    c.set('starting', webapp.starting)
    c.set('lasterr', webapp.lasterr)

}

function setup_events() {
    document.getElementById('help-icon').addEventListener('click', function(evt) {
        document.getElementById('help-dialog').open()
    })
}

function create_polymer_elements() {
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

            function onchoosefolder(entry) {
                if (entry) {
                    var retainstr = chrome.fileSystem.retainEntry(entry)
                    var d = {'retainstr':retainstr}
                    chrome.storage.local.set(d)
                    console.log('set retainstr!')
                    if (window.webapp) {
                        bg.WSC.DirectoryEntryHandler.fs = new bg.WSC.FileSystem(entry)
                        if (webapp.handlers.length == 0) {
                            webapp.add_handler(['.*',bg.WSC.DirectoryEntryHandler])
                            webapp.init_handlers()
                        }
                        webapp.change()
                    }
                    // reload UI, restart server... etc
                }
            }
            chrome.fileSystem.chooseEntry({type:'openDirectory'}, onchoosefolder)

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
            optBackground: {
                type: Boolean,
                observer: 'backgroundChange',
                value: localOptions['optBackground']
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
            chrome.storage.local.set({'optAllInterfaces':this.optAllInterfaces})
        },
        backgroundChange: function(val) {
            console.log('persist setting background')
            webapp.opts.optBackground = this.optBackground
            chrome.storage.local.set({'optBackground':this.optBackground})
        },
        optRenderIndexChange: function(val) {
            console.log('persist setting renderIndex')
            webapp.opts.renderIndex = this.optRenderIndex
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
