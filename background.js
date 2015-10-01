function reload() { chrome.runtime.reload() }

chrome.runtime.onSuspend.addListener( function(evt) {
    console.error('onSuspend',evt)
    // send notification using chrome.notifications?
    if (window.app) app.stop('onsuspend')
})
chrome.runtime.onSuspendCanceled.addListener( function(evt) {
    console.error('onSuspendCanceled',evt)
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
