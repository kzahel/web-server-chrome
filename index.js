window.reload = chrome.runtime.reload

function addinterfaces() {
    var version = getchromeversion()
    if (version >= 44) {
        chrome.system.network.getNetworkInterfaces( function(result) {
            if (result) {
                var cont = document.getElementById('other-interfaces')
                if (cont) {
                    for (var i=0; i<result.length; i++) {
                        console.log('network interface:',result[i])
                        if (result[i].prefixLength == 24) {
                            var a = document.createElement('a')
                            a.target = "_blank"
                            var href = 'http://' + result[i].address + ':' + bg.app.port
                            a.innerText = href
                            a.href = href
                            cont.appendChild(a)
                        }
                    }
                }
            }
        })
    }
}


chrome.runtime.getBackgroundPage( function(bg) {
    console.log('got bg page')
    window.bg = bg;
    
    document.getElementById('status').innerText = 'OK'

    addinterfaces()

    function choosefolder() {
        chrome.fileSystem.chooseEntry({type:'openDirectory'},
                                      onchoosefolder
                                     )
    }

    function onchoosefolder(entry) {
        if (entry) {
            window.entry = entry
            bg.entry = entry
            bg.haveentry(entry)
            var retainstr = chrome.fileSystem.retainEntry(entry)
            var d = {'retainstr':retainstr}
            chrome.storage.local.set(d)
            document.getElementById('curfolder').innerText = d['retainstr']
            document.getElementById('status').innerText = 'OK'
            console.log('set retainstr!')
        }
    }

    document.getElementById('choose-folder').addEventListener('click', choosefolder)

    chrome.storage.local.get('retainstr',function(d) {
        if (d['retainstr']) {
            chrome.fileSystem.restoreEntry(d['retainstr'], function(entry) {
                if (entry) {
                    window.entry = entry
                    bg.entry = entry
                    bg.haveentry(entry)
                } else {
                    document.getElementById('status').innerText = 'DIRECTORY MISSING. CHOOSE AGAIN.'                    
                }
            })
            document.getElementById('curfolder').innerText = d['retainstr']
        }
    })

    function serveFromDOM() {
        var requestFileSystem = window.webkitRequestFileSystem || window.requestFileSystem;
        requestFileSystem(
            PERSISTENT,
            0,
            function( fs ){
                fs.root.getDirectory(
                    '/',
                    {},
                    function( entry ) {
                        // write test file index.html in root directory
                        entry.getFile( 
                            'index.html',
                            { create: true },
                            function( fileEntry ){
                                fileEntry.createWriter(
                                    function( fileWriter ) {
                                        fileWriter.onwrite = function() { console.log( 'file written' ); };
                                        fileWriter.onerror = function() { console.log( 'save error' ); };
                                        var blob = new Blob(
                                            [ '<html><head></head><body><h1>Serving files from DOMfilesystem</h1></body></html>' ],
                                            { type: 'text/html' }
                                        );
                                        fileWriter.write( blob );
                                    }
                                );
                            },
                            function(e) {
                                // error
                                console.log(e);
                            }
                        );
      
                        window.entry = entry;
                        bg.entry = entry;
                        bg.haveentry(entry);
                  
                        document.getElementById('curfolder').innerText = entry.fullPath;
                        document.getElementById('status').innerText = 'OK';
      
                    },
                    function(e) {
                        // error
                        console.log(e);
                    }
                );
            },
            function(e) {
                // error
                console.log(e);
            }
        );
    }

    var el = document.getElementById('dfs')
    if (el) { el.addEventListener('click', serveFromDOM ); }


function onDonate(evt) {
    console.log('onDonate',evt)
}
function onDonateFail(evt) {
    console.log('onDonateFail',evt)
}

var elt = document.getElementById('donate')
    if (elt) {
        elt.addEventListener('click', function(evt) {
            var sku = "webserverdonation";
            google.payments.inapp.buy({
                'parameters': {'env': 'prod'},
                'sku': sku,
                'success': onDonate,
                'failure': onDonateFail
            });
        })
    }



})
