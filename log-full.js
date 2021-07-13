// add this file to your "blackbox" e.g. blackboxing, making devtools not show logs as coming from here
(function() {
    if (console.clog) { return }
    window.logging = false
    var L = {
        UPNP: { show: true, color:'green' },
        WSC: { show: true, color:'green' }
    }
    Object.keys(L).forEach( function(k) { L[k].name = k } )
    window.ORIGINALCONSOLE = {log:console.log, warn:console.warn, error:console.error}
    window.LOGLISTENERS = []
    function wrappedlog(method) {
        var wrapped = function() {
            var args = Array.prototype.slice.call(arguments)
            ORIGINALCONSOLE[method].apply(console,args)
            console.logs.push(args)
            if (method == 'error') {
                args = ['%cError','color:red'].concat(args)
            } else if (method == 'warn') {
                args = ['%cWarn','color:orange'].concat(args)
            }
        }
        return wrapped
    }
    
    console.log = wrappedlog('log')
    console.logs = [ ]
    console.warn = wrappedlog('warn')
    console.error = wrappedlog('error')
    console.clog = function() {
        if (! WSC.DEBUG) { return }
        // category specific logging
        var tolog = arguments[0]
        tolog = L[tolog]
        if (tolog === undefined) {
            var args = Array.prototype.slice.call(arguments,1,arguments.length)
            args = ['%c' + 'UNDEF', 'color:#ac0'].concat(args)
            consolelog.apply(console,args)
        } else if (tolog.show) {
            var args = Array.prototype.slice.call(arguments,1,arguments.length)
            if (tolog.color) {
                args = ['%c' + tolog.name, 'color:'+tolog.color].concat(args)
            }
            ORIGINALCONSOLE.log.apply(console,args)
        }
    }

    WSC.saveLogs = function() {
        if (window.logging) {
            return
        }
        function saveLogs() {
            if (! app) {
                return
            }
            if (! app.fs) {
                return
            }
            if (app.opts.optSaveLogs) {
                if (console.logs.length > 0) {
                    var a = console.logs
                    var q = '\n'
                    console.logs = [ ]
                    if (a[0][0] == 'background.js') {
                        var q = q + 'STARTUP: ' + new Date().toString() + '\n\n'
                    }
                    for (var i=0; i<a.length; i++) {
                        if (a[i].length == 1) {
                            var q = q + a[i][0] + '\n\n'
                        } else {
                            var b = ''
                            for (var t=0; t<a[i].length; t++) {
                                if (typeof a[i][t] !== 'object') {
                                    var b = b+ a[i][t] + ' '
                                } else {
                                    var b = b + JSON.stringify(a[i][t], null, 2)
                                }
                            }
                            var q = q + b + '\n\n'
                        }
                    }
                    //console.log(app.opts)
                    var saveTo = app.opts.optSaveLogsFilename
                    if (! saveTo) {
                        var saveTo = '/wsc.log'
                    }
                    if (! saveTo.startsWith('/')) {
                        var saveTo = '/' + saveTo
                    }
                    app.fs.getByPath(saveTo, function(file) {
                        if (file && ! file.error && file.isFile) {
                            file.file(function(file) {
                                var reader = new FileReader()
                                reader.onload = function(e) {
                                    var saveTo = app.opts.optSaveLogsFilename
                                    if (! saveTo) {
                                        var saveTo = '/wsc.log'
                                    }
                                    if (! saveTo.startsWith('/')) {
                                        var saveTo = '/' + saveTo
                                    }
                                    var oldData = e.target.result
                                    var newData = q
                                    var data = oldData + newData
                                    var data = new TextEncoder('utf-8').encode(data).buffer
                                    var parts = saveTo.split('/')
                                    var path = parts.slice(0,parts.length-1).join('/')
                                    var filename = parts[parts.length-1]
                                    app.fs.getByPath(saveTo, function(entry) {
                                        entry.remove( function() {
                                            app.fs.getByPath(path, function(folder) {
                                                folder.getFile(filename, {create:true}, function(entry) {
                                                    if (entry && entry.isFile) {
                                                        entry.createWriter(function(writer) {
                                                            writer.onwrite = writer.onerror = function() { }
                                                            writer.write(new Blob([data]))
                                                        })
                                                    }
                                                })
                                            })
                                        })
                                    })
                                }
                                reader.readAsText(file)
                            })
                        } else {
                            var saveTo = app.opts.optSaveLogsFilename
                            if (! saveTo) {
                                var saveTo = '/wsc.log'
                            }
                            if (! saveTo.startsWith('/')) {
                                var saveTo = '/' + saveTo
                            }
                            if (file.isDirectory) {
                                if (saveTo.endsWith('/')) {
                                    var saveTo = saveTo + 'wsc.log'
                                } else {
                                    var saveTo = saveTo + '/wsc.log'
                                }
                                
                            }
                            var data = q
                            var data = new TextEncoder('utf-8').encode(data).buffer
                            var parts = saveTo.split('/')
                            var path = parts.slice(0,parts.length-1).join('/')
                            var filename = parts[parts.length-1]
                            app.fs.getByPath(path, function(folder) {
                                folder.getFile(filename, {create:true}, function(entry) {
                                    if (entry && entry.isFile) {
                                        entry.createWriter(function(writer) {
                                            writer.onwrite = writer.onerror = function() { }
                                            writer.write(new Blob([data]))
                                        })
                                    }
                                })
                            })
                            
                        }
                    }, true)
                }
            }
        }
        window.logging = true
        if (app.opts.optSaveLogs) {
            var interval = app.opts.optSaveLogsInterval * 60 * 1000
            setInterval(saveLogs, interval)
        }
    }
    
})();
