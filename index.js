window.reload = chrome.runtime.reload

function addinterfaces() {
    var version = getchromeversion()
    if (version >= 44) {
        chrome.system.network.getNetworkInterfaces( function(result) {
            if (result) {
                var wport = document.getElementById('choose-port').value;
                console.log("port found: " + wport);
                
                var contLocal = document.getElementById('local-interface');
                if (typeof contLocal !== 'undefined') {
                    while (contLocal.firstChild) {
                        contLocal.removeChild(contLocal.firstChild);
                    }                
                    var a = document.createElement('a')
                    a.target = "_blank";
                    var href = 'http://127.0.0.1:' + wport;
                    a.innerText = href;
                    a.href = href;
                    contLocal.appendChild(a);

                } else{
                  console.log("not contLocal!");
                }
                
                var cont = document.getElementById('other-interfaces')
                if (typeof cont !== 'undefined') {
                    while (cont.firstChild) {
                        cont.removeChild(cont.firstChild);
                    }                
                
                    for (var i=0; i<result.length; i++) {
                        console.log('network interface:',result[i])
                        if (result[i].prefixLength == 24) {
                            var a = document.createElement('a')
                            a.target = "_blank";
                            var href = 'http://' + result[i].address + ':' + wport;
                            a.innerText = href;
                            a.href = href;
                            cont.appendChild(a);
                        }
                    }
                } else{
                  console.log("not cont!");
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
        chrome.fileSystem.chooseEntry({type:'openDirectory'}, onchoosefolder)
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

    function onRestart() {
        var input = document.getElementById('choose-port');
        if (!input) return;
    
        var wport = input.value;
        console.log("port found: " + wport);
        addinterfaces()
        if (bg) {
            bg.restart(parseInt(wport));
        }
    }

    document.getElementById('restart').addEventListener('click', onRestart)



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




})
