console.log('background.js')
var ALARMID = "check_wsc_periodic"
var WSCID = "ofhbbkphhbklhfoeikjpcbhemlocgigb"
var OS
if (navigator.userAgent.match('OS X')) {
    OS = 'Mac'
} else if (navigator.userAgent.match("Windows")) {
    OS = "Win"
} else {
    OS = "Chrome"
}

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
        if (app.started || app.starting || app.starting_interfaces) {
            console.log('actually, dont wake up, im already started/starting')
        } else {
            app.start()
        }
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
    if (opts.optPreventSleep !== undefined) {
        localOptions.optPreventSleep = opts.optPreventSleep
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

    // (needs "background" permission)
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

function launch(launchData) {
    launchData = launchData || {}
    if (launchData.source == 'reload') { console.log('app was reloaded'); return }
    if (launchData.source == 'restart') { console.log('chrome restarted'); return }

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
                                 var hiddenwin = chrome.app.window.get('hidden')
                                 if (hiddenwin) { hiddenwin.close() }
                                 
			     });
    //console.log('launched')

    if (window.app) { console.log('already have webapp',app); return }

}

function teststart() {
    var opts = {}
    opts.port = 8887
    opts.optAllInterfaces = true
    opts.optTryOtherPorts = true
    opts.optRetryInterfaces = true
    opts.handlers = []
    window.webapp = new WSC.WebApplication(opts)
    webapp.start( function(result) { console.log('webapp start result',result) } )
}

chrome.app.runtime.onLaunched.addListener(launch);

function get_webapp(opts) {
    if (! window.app) {
        window.app = new WSC.WebApplication(opts)
    }
    return window.app
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

function hidden_click_configure() {
    // user clicked on the help info thing in the hidden page.
    launch({source:"hidden_window"})
}

function create_hidden() {
    if (OS != 'Chrome') { return }

    if (app.opts && app.opts.optBackground && app.opts.optAllInterfaces) {
        console.log('creating hidden window')
        var W = 300
        var H = 120
        function oncreated(win) {
            // can also set width/top etc properties directly
            win.outerBounds.setPosition(screen.width - W, screen.availHeight - H - 60)
            win.outerBounds.setSize(W, H)
            win.show()
            win.minimize()
            win.onClosed.addListener( function() {
                // depends on WHY we are closed...
                var wins = chrome.app.window.getAll()
                if (app.opts && app.opts.optBackground) {

                    if ( (wins.length == 1 && win.id == 'hidden') ||
                         wins.length == 0) {
                        setTimeout( function() {
                            create_hidden()
                        }, 1000 )
                    }
                }
            })
        }
        var opts = {id:'hidden',
                    hidden:true,

                   }

        chrome.app.window.create("hidden.html",
                                 opts,
                                 oncreated)
    }
}

function window_closed(win) {
    console.log('window closed',win)
    if (window.app) {
        if (app.opts && app.opts.optBackground) {
            setTimeout( function() {
                create_hidden()
            }, 1)

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
window.reload = chrome.runtime.reload
