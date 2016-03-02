var ALARMID = "check_wsc_periodic"
var WSCID = "ofhbbkphhbklhfoeikjpcbhemlocgigb"
function onchoosefolder(entry) {
    if (entry) {
        var retainstr = chrome.fileSystem.retainEntry(entry)
        var d = {'retainstr':retainstr}
        chrome.storage.local.set(d)
        console.log('set retainstr!')
        var webapp = get_webapp()
        if (webapp) {
            var fs = new WSC.FileSystem(entry)
            webapp.fs = fs
            webapp.handlers = []
            webapp.add_handler(['.*',WSC.DirectoryEntryHandler.bind(null,fs)])
            webapp.init_handlers()
            webapp.change()
        }
        // reload UI, restart server... etc
    }
}
function settings_ready(d) {
    window.localOptions = d
    chrome.alarms.getAll( onAllAlarms )
}
chrome.storage.local.get(null, settings_ready)
function sendWSCAwakeMessage() {
    if (localOptions.optBackground && localOptions.optAutoStart) {
        console.log('background && autostart. wake up!')
        get_webapp(window.localOptions)
    }
}
function onAlarm( alarm ) {
    console.log('alarm fired',alarm)
    if (alarm.name == ALARMID) {
        sendWSCAwakeMessage()
    }
}

chrome.alarms.onAlarm.addListener( onAlarm )
function backgroundSettingChange( opts ) {
    if (opts.optBackground !== undefined) {
        localOptions.optBackground = opts.optBackground
    }
    if (opts.optBackground !== undefined) {
        localOptions.optAutoStart = opts.optAutoStart
    }
    if (localOptions.optBackground && localOptions.optAutoStart) {
        chrome.alarms.getAll( onAllAlarms )
    } else {
        chrome.alarms.clearAll()
    }
}
function onAllAlarms( alarms ) {
    if (! localOptions.optBackground) {
        return
    }
    if (! localOptions.optAutoStart) {
        return
    }
    var found = false
    
    console.log('got alarms',alarms)
    for (var i=0; i<alarms.length; i++) {
        if (alarms[i].name == ALARMID) {
            found = true
        }
    }
    if (! found) {
        console.log('created periodic alarm')
        chrome.alarms.create(ALARMID, {'periodInMinutes':1})
    }
    // also fire the callback/alarm thing sooner, perhaps...
    console.log('also fire alarm now?')
    sendWSCAwakeMessage()
}


chrome.runtime.onStartup.addListener( function(evt) {
    // should fire when profile loads up...
    window.ONSTARTUP_FIRED = true
    console.log('onStartup',evt)
})
function createNotification(msg, prio) {
//    if (prio === undefined) { prio = 0 }
    var opts = {type:"basic",
                title:msg,
//                priority:prio,
                iconUrl:'/images/200ok-256.png',
                message:msg}
    chrome.notifications.create( "suspending", opts, function(){} )
}

function triggerKeepAwake() {
    //createNotification('WebServer') // creating a notification also works, but is annoying

    // HACK: make an XHR to cause onSuspendCanceled event
    console.log('triggerKeepAwake')
    var xhr = new XMLHttpRequest
    xhr.open("GET","http://127.0.0.1:" + (localOptions.port || 8887) + '/dummyUrlPing')
    function onload(evt) {
        console.log('triggerKeepAwake XHR loaded',evt)
    }
    xhr.onerror = onload
    xhr.onload = onload
    xhr.send()
}

chrome.runtime.onSuspend.addListener( function(evt) {
    //createNotification("onSuspend")
    console.warn('onSuspend')
    
    if (localOptions.optBackground) {
        triggerKeepAwake()
    } else {
        if (window.app) app.stop('onsuspend')
    }
})
chrome.runtime.onSuspendCanceled.addListener( function(evt) {
    //createNotification("suspendcanceled!")
    console.warn('onSuspendCanceled')
})

chrome.app.runtime.onLaunched.addListener(function(launchData) {
    console.log('onLaunched with launchdata',launchData)

    var info = {type:'onLaunched',
                launchData: launchData}
    var opts = {id:'index'}
    //var page = 'index.html'
    var page = 'polymer-ui/index.html'
    chrome.app.window.create(page,
                             opts,
                             function(mainWindow) {
                                 window.mainWindow = mainWindow;
                                 mainWindow.onClosed.addListener( window_closed )
			     });
    //console.log('launched')

    if (window.app) { console.log('already have webapp',app); return }

});

function get_webapp(opts) {
    if (! window.app) {
        window.app = create_app(opts)
    }
    return app
}

function create_app(opts) {
    var app = new WSC.WebApplication(opts)
    return app
}

function get_status() {
    // gets current status of web server
    var status = {}
    if (window.app) {
        status.app = app
        status.created = true
    } else {
        status.created = false
    }
    return status
}

function start_app() {
    if (app) { app.start() }
}
function stop_app() {
    if (window.app) { app.stop() }
}

function window_closed() {
    if (window.app) {
        if (app.opts && app.opts.optBackground) { 
            console.log('not stopping server, backgrounding mode on');
            return 
        }
    }
    console.log('main window closed. stopping server')
    stop_app()
}

function restart(port) { 
    if (window.app) {
        app.stop();
        app.port = port;
        app.start();
    }
}
function reload() { chrome.runtime.reload() }
