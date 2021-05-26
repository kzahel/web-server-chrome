(function() {
    var utilityHandler = [ ]
    utilityHandler.humanFileSize = function(bytes, si=false, dp=1) {
            //from https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/10420404
            const thresh = si ? 1000 : 1024;
            if (Math.abs(bytes) < thresh) {
              return bytes + ' B';
            }
            const units = si 
              ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
              : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
            let u = -1;
            const r = 10**dp;
            do {
              bytes /= thresh;
              ++u;
            } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
            return bytes.toFixed(dp) + ' ' + units[u];
    }
    utilityHandler.lastModified = function(modificationTime) {
        var lastModifiedMonth = modificationTime.getMonth() + 1
        var lastModifiedDay = modificationTime.getDate()
        var lastModifiedYear = modificationTime.getFullYear().toString().substring(2, 4)
        var lastModifiedHours = modificationTime.getHours()
        var lastModifiedMinutes = modificationTime.getMinutes()
        var lastModifiedSeconds = modificationTime.getSeconds()
        var lastModified = lastModifiedMonth+
                           lastModifiedDay+
                           lastModifiedYear+
                           lastModifiedHours+
                           lastModifiedMinutes+
                           lastModifiedSeconds
        return lastModified
    }
    utilityHandler.lastModifiedStr = function(modificationTime) {
        var lastModifiedMonth = modificationTime.getMonth() + 1
        var lastModifiedDay = modificationTime.getDate()
        var lastModifiedYear = modificationTime.getFullYear().toString().substring(2, 4)
        var lastModifiedHours = modificationTime.getHours()
        var lastModifiedMinutes = modificationTime.getMinutes()
        var lastModifiedSeconds = modificationTime.getSeconds()
        if (lastModifiedSeconds.toString().length != 2) {
            var lastModifiedSeconds = '0' + lastModifiedSeconds
        }
        if (lastModifiedMinutes.toString().length != 2) {
            var lastModifiedMinutes = '0' + lastModifiedMinutes
        }
        if (lastModifiedDay.toString().length != 2) {
            var lastModifiedDay = '0' + lastModifiedDay
        }
        if (lastModifiedHours >= 12) {
            var lastModifiedAmPm = 'PM'
            if (lastModifiedHours > 12) {
                var lastModifiedHours = lastModifiedHours - 12
            }
        } else {
            var lastModifiedAmPm = 'AM'
        }
        var lastModifiedStr = lastModifiedMonth+'/'+
                              lastModifiedDay+'/'+
                              lastModifiedYear+', '+
                              lastModifiedHours+':'+
                              lastModifiedMinutes+':'+
                              lastModifiedSeconds +' '+
                              lastModifiedAmPm
        return lastModifiedStr
    }
    utilityHandler.htaccessFileRequested = function(filerequested) {
        if (filerequested == 'index.html' ||
            filerequested == 'index.htm' ||
            filerequested == 'index' ||
            filerequested == 'index.xhtm' ||
            filerequested == 'index.xhtml' ||
            filerequested == '') {
            var filerequested = ''
            return filerequested
        } else {
            return filerequested
        }
    }
    WSC.utilityHandler = utilityHandler
})();
