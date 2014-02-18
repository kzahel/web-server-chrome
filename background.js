//blah

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
    console.log('launched')

    var app = new chrome.WebApplication({port:8889})
    app.start()
});

function reload() { chrome.runtime.reload() }