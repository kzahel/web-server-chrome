chrome.runtime.getBackgroundPage( function(bg) {
    window.bg = bg;

    document.getElementById('status').innerText = 'OK'

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

})