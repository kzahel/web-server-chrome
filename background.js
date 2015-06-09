//blah

function reload() { chrome.runtime.reload() }

chrome.runtime.onSuspend.addListener( function(evt) {
    console.error('onSuspend',evt)
    if (app) app.stop()
})
chrome.runtime.onSuspendCanceled.addListener( function(evt) {
    console.error('onSuspendCanceled',evt)
})

chrome.app.window.onClosed.addListener(function(evt) {
    console.log('window closed. shutdown server, unload background page? hm?')
})

chrome.app.runtime.onLaunched.addListener(function(launchData) {
    console.log('onLaunched with launchdata',launchData)

    var info = {type:'onLaunched',
                launchData: launchData}
    var opts = {id:'index'}
    var page = 'index.html'
    //var page = 'polymer/index.html'
    chrome.app.window.create(page,
                             opts,
                             function(mainWindow) {
                                 window.mainWindow = mainWindow;
			     });
    //console.log('launched')

    if (window.app) { console.log('already have webapp',app); return }

    function MainHandler() {
        BaseHandler.prototype.constructor.call(this)
    }
    _.extend(MainHandler.prototype, {
        get: function() {
            // handle get request
            this.write('OK!, ' + this.request.uri)
        }
    })
    for (var key in BaseHandler.prototype) {
        MainHandler.prototype[key] = BaseHandler.prototype[key]
    }

    var handlers = [
//        ['.*', MainHandler]
//        ['.*', PackageFilesHandler]
        ['.*', DirectoryEntryHandler]
    ]

    chrome.system.network.getNetworkInterfaces( function(result) {
	if (result) {
	    for (var i=0; i<result.length; i++) {
		console.log('network interface:',result[i])
	    }

	}
    })

    // TODO -- auto free port discovery
    window.app = new chrome.WebApplication({handlers:handlers, port:8887, renderIndex:false})
    app.start()
});

function reload() { chrome.runtime.reload() }
