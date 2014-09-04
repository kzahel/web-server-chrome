//blah

function reload() { chrome.runtime.reload() }

chrome.runtime.onSuspend.addListener( function(evt) {
    console.error('onSuspend',evt)
})
chrome.runtime.onSuspendCanceled.addListener( function(evt) {
    console.error('onSuspendCanceled',evt)
})


chrome.app.runtime.onLaunched.addListener(function(launchData) {
    console.log('onLaunched with launchdata',launchData)
    var info = {type:'onLaunched',
                launchData: launchData}
    var opts = {id:'index'}
    chrome.app.window.create('index.html',
                             opts,
                             function(mainWindow) {
                                 window.mainWindow = mainWindow;
			     });
    //console.log('launched')



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

    var app = new chrome.WebApplication({handlers:handlers, port:8887})
    app.start()
});

function reload() { chrome.runtime.reload() }