// add this file to your "blackbox" e.g. blackboxing, making devtools not show logs as coming from here
(function() {
	if (console.clog) { return }
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
            if (method == 'error') {
                args = ['%cError','color:red'].concat(args)
            } else if (method == 'warn') {
                args = ['%cWarn','color:orange'].concat(args)
            }
        }
        return wrapped
    }
    
    console.log = wrappedlog('log')
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
})();
