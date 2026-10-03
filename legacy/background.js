console.log('background.js')
var ALARMID = "check_wsc_periodic"
var WSCID = "ofhbbkphhbklhfoeikjpcbhemlocgigb"
var HADEVENT = false

// Migration reminders are deliberately bounded. Version 0.5.4 shows one
// notification after update, then at most one per week until the user removes
// the obsolete app or explicitly stops reminders. It never opens a migration
// window on startup or an arbitrary background event-page load.
var MIGRATE_UNINSTALL_URL = 'https://ok200.app/uninstall?ref=legacy-app'
var OS = getMigrationPlatform(navigator.userAgent)
var localOptions

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
    localOptions = d
    let dCpy = {};
    Object.assign(dCpy, d);
    delete dCpy.optPrivateKey;// dont fill logs with crypto info
    delete dCpy.optCertificate;
	console.log('settings:',dCpy) 
	setTimeout( maybeStartup, 2000 ) // give background accept handler some time to trigger
    //chrome.alarms.getAll( onAllAlarms )
}
chrome.storage.local.get(null, settings_ready)

function maybeStartup() {
	if (getting_settings) { return } // accept handler
	if (had_backgroundaccept) { return }
    if (localOptions.optBackground && localOptions.optAutoStart) {
        console.log('background && autostart. wake up!')
        get_webapp(localOptions)
        if (app.started || app.starting || app.starting_interfaces) {
            console.log('actually, dont wake up, im already started/starting')
        } else {
            app.start()
        }
    }
}
function onAlarm( alarm ) {
    console.log('alarm fired',alarm)
    if (alarm.name == 'migration') {
        maybeShowMigrationPrompt('alarm', false, false)
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
	/*
    if (localOptions.optBackground && localOptions.optAutoStart) {
        chrome.alarms.getAll( onAllAlarms )
    } else {
        chrome.alarms.clearAll()
    }*/
}
function onAllAlarms( alarms ) {
	return
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


var migrateWindowCreating = false
function showMigrateWindow() {
    if (migrateWindowCreating) return
    var existing = chrome.app.window.get('migrate')
    if (existing) { existing.show(); existing.focus(); return }
    migrateWindowCreating = true
    chrome.app.window.create('migrate.html', {
        id: 'migrate',
        outerBounds: { width: 440, height: 560 }
    }, function() { migrateWindowCreating = false })
}

function openMigrationPage() {
    var url = getMigrationUrl(OS)
    // chrome.browser.openTab is ChromeOS-only. Retired Chrome Apps can still
    // execute their event page on Windows, where window.open is the working
    // fallback.
    if (chrome.browser && typeof chrome.browser.openTab === 'function') {
        try {
            chrome.browser.openTab({ url: url })
            return
        } catch (error) {
            console.warn('chrome.browser.openTab failed; using window.open', error)
        }
    }
    window.open(url)
}

function checkForNewExtension(callback) {
    try {
        chrome.runtime.sendMessage(NEW_EXTENSION_ID, {type: 'ping'}, function(response) {
            var installed = !chrome.runtime.lastError && !!(response && response.installed)
            callback(installed)
        })
    } catch (error) {
        callback(false)
    }
}

function resetMigrationAlarm(callback) {
    chrome.alarms.clear('migration', function() {
        chrome.alarms.create('migration', { periodInMinutes: MIGRATION_ALARM_MINUTES })
        if (callback) callback()
    })
}

function ensureMigrationAlarm() {
    chrome.storage.local.get('migrationRemindersDisabledAt', function(data) {
        if (data.migrationRemindersDisabledAt) {
            chrome.alarms.clear('migration')
            return
        }
        chrome.alarms.get('migration', function(alarm) {
            if (!alarm || alarm.periodInMinutes !== MIGRATION_ALARM_MINUTES) {
                resetMigrationAlarm()
            }
        })
    })
}

function stopMigrationReminders() {
    chrome.storage.local.set({ migrationRemindersDisabledAt: Date.now() }, function() {
        chrome.alarms.clear('migration')
        chrome.notifications.clear('deprecation')
        var migrateWindow = chrome.app.window.get('migrate')
        if (migrateWindow) migrateWindow.close()
    })
}

function requestLegacyUninstall() {
    chrome.management.uninstallSelf({ showConfirmDialog: true }, function() {
        if (chrome.runtime.lastError) {
            console.warn('Unable to remove the old app', chrome.runtime.lastError.message)
        }
    })
}

function maybeShowMigrationPrompt(reason, force, useWindow) {
    chrome.storage.local.get(
        ['migrationLastPromptedAt', 'migrationSnoozedUntil', 'migrationRemindersDisabledAt'],
        function(data) {
            var now = Date.now()
            if (data.migrationRemindersDisabledAt) {
                console.log('migration reminders disabled, skipping [' + reason + ']')
                chrome.alarms.clear('migration')
                return
            }
            if (!force && !isMigrationReminderDue(
                data.migrationLastPromptedAt,
                data.migrationSnoozedUntil,
                now
            )) {
                console.log('migration reminder not due, skipping [' + reason + ']')
                return
            }
            if (data.migrationSnoozedUntil && now < data.migrationSnoozedUntil) {
                console.log('migration reminder snoozed, skipping [' + reason + ']')
                return
            }

            checkForNewExtension(function(installed) {
                if (installed) {
                    chrome.storage.local.set({ migrationExtensionDetectedAt: now })
                } else {
                    chrome.storage.local.remove('migrationExtensionDetectedAt')
                }

                chrome.storage.local.set({ migrationLastPromptedAt: now })
                if (useWindow) {
                    showMigrateWindow()
                } else {
                    showDeprecationNotification(installed)
                }
            })
        }
    )
}

function onStartup(evt) {
	HADEVENT = true
    window.ONSTARTUP_FIRED = true
    console.log('onStartup',evt)
    ensureMigrationAlarm()
}
chrome.runtime.onStartup.addListener(onStartup)
function createNotification(msg, prio) {
//    if (prio === undefined) { prio = 0 }
    var opts = {type:"basic",
                title:msg,
//                priority:prio,
                iconUrl:'/images/200ok-256.png',
                message:msg}
    chrome.notifications.create( "suspending", opts, function(){} )
}

// Deprecation notification for Chrome Apps sunset
function showDeprecationNotification(extensionInstalled) {
    var copy = getMigrationNotificationCopy(OS, extensionInstalled)
    var opts = {
        type: 'basic',
        title: copy.title,
        message: copy.message,
        iconUrl: '/images/200ok-256.png',
        priority: 2,
        requireInteraction: true,
        buttons: [
            { title: 'Remove old app' },
            { title: 'Stop reminders' }
        ]
    }
    chrome.notifications.create('deprecation', opts, function() {})
}

chrome.notifications.onClicked.addListener(function(notificationId) {
    if (notificationId === 'deprecation') {
        openMigrationPage()
        chrome.notifications.clear('deprecation')
    }
})

chrome.notifications.onButtonClicked.addListener(function(notificationId, buttonIndex) {
    if (notificationId !== 'deprecation') return
    if (buttonIndex === 0) {
        requestLegacyUninstall()
    } else if (buttonIndex === 1) {
        stopMigrationReminders()
    }
})

// Handle messages from ok200.app website and the new extension
chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
    console.log('onMessageExternal', message, sender)
    if (message.type === 'ping') {
        sendResponse({ installed: true, version: chrome.runtime.getManifest().version })
    } else if (message.type === 'launch') {
        launch({})
        sendResponse({ launched: true })
    }
})

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

chrome.sockets.tcpServer.onAccept.addListener(backgroundAccept)
var bgacceptqueue = []
var getting_settings = false
var had_backgroundaccept = false
function backgroundAccept(sockInfo) {
	console.log('background onaccept')
	had_backgroundaccept = true
    if (window.webapp && webapp.started) {
        return // app registered an accept handler.
    }
	HADEVENT = true
	
    bgacceptqueue.push(sockInfo)
    
    if (getting_settings) return

	if (localOptions) {
		console.log('already had settings')
		onsettings(localOptions)
	} else {
		getting_settings = true
		console.log('getting settings')
		chrome.storage.local.get(null, onsettings)
	}
    
	function onsettings(d) {
		getting_settings = false
		localOptions = d
		console.log('starting...')
		get_webapp(d).start( function(result) {
			console.log('started.')
			webapp.acceptQueue = bgacceptqueue
			bgacceptqueue = []
			webapp.processAcceptQueue()
		})
	}
}

chrome.runtime.onSuspend.addListener( function(evt) {
    //createNotification("onSuspend")
    console.warn('onSuspend')
    return

	// using a persistent socket now...
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
    HADEVENT = true

    launchData = launchData || {}
    //if (launchData.source == 'reload') { console.log('app was reloaded'); return }
    if (launchData.source == 'restart') { console.log('chrome restarted'); return }

    // A launch is an explicit user request, so show the richer migration
    // prompt whenever the retired platform still delivers this event.
    maybeShowMigrationPrompt('onLaunched', true, true)

    //console.log('onLaunched with launchdata',launchData)

    var info = {type:'onLaunched',
                launchData: launchData}
    var opts = {id:'index',
                outerBounds: { width: 410,
                               height: 700 }
               }
    //var page = 'index.html'
    var page = 'react-ui/index.html'
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
	webapp.add_handler(['.*', WSC.ExampleWebSocketHandler])
	webapp.init_handlers()
    webapp.start( function(result) { console.log('webapp start result',result) } )
}

chrome.runtime.onInstalled.addListener(function() {
    HADEVENT = true
    chrome.runtime.setUninstallURL(MIGRATE_UNINSTALL_URL)
    chrome.storage.local.get('migrationRemindersDisabledAt', function(data) {
        if (data.migrationRemindersDisabledAt) {
            chrome.alarms.clear('migration')
            return
        }
        resetMigrationAlarm(function() {
            maybeShowMigrationPrompt('onInstalled', true, false)
        })
    })
})

chrome.app.runtime.onLaunched.addListener(launch);

// Repair a missing weekly alarm whenever another event wakes the page. This
// does not display a prompt by itself.
ensureMigrationAlarm()

function get_webapp(opts) {
    if (! window.app) {
        window.app = new WSC.WebApplication(opts)
		window.webapp = app
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
    if (OS !== 'chromeos') { return }

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
                    hidden:true
                   }

        chrome.app.window.create("hidden.html",
                                 opts,
                                 oncreated)
    }
}

function window_closed(win) {
    console.log('main window closed')
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

setTimeout( function() {
	if (! HADEVENT) {
		console.log('background page was manually reloaded in devtools? or resumed from suspended state...')
		return
		var testimg = new Image();
		var triggered = false
		testimg.__defineGetter__('id', devtools_open)
		console.log(testimg)
		function maybeRestart() {
			if (! chrome.runtime.getManifest().update_url) {
				console.log('running as unpacked app')
				console.log('reload()')
				chrome.runtime.reload()
			}
		}
		function devtools_open() {
			if (triggered) { return }
			triggered = true
			setTimeout( maybeRestart, 1 )
			return 'test'
		}
	}
}, 1000) // how long until chrome sends the runtime event?
