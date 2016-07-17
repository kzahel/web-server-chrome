(function() {

	window.WSC = {store_id:"ofhbbkphhbklhfoeikjpcbhemlocgigb"}
	WSC.DEBUG = false
	WSC.VERBOSE = false

function getchromeversion() {
    var version
    var match = navigator.userAgent.match(/Chrome\/([\d]+)/)
    if (match) {
        var version = parseInt(match[1])
    }
    return version
}
WSC.getchromeversion = getchromeversion


	WSC.maybePromise = function(maybePromiseObj, resolveFn, ctx) {
		if(maybePromiseObj && maybePromiseObj.then) {
			return maybePromiseObj.then(function(ret){ return resolveFn.call(ctx, ret); });
		} else {
			return resolveFn.call(ctx, maybePromiseObj);
		}
	}
	WSC.strformat = function(s) {
		var args = Array.prototype.slice.call(arguments,1,arguments.length);
		return s.replace(/{(\d+)}/g, function(match, number) {
			return typeof args[number] != 'undefined'
			    ? args[number]
			    : match
			;
		});
	}
	WSC.parse_header = function(line) {
		debugger
	}
	WSC.encode_header = function(name, d) {
		if (!d) {
			return name
		}
		var out = [name]
		for (var k in d) {
			var v = d[k]
			if (! v) {
				out.push(k)
			} else {
				// quote?
				outpush(k + '=' + v)
			}
		}
		return out.join('; ')
	}
	
if (! String.prototype.endsWith) {
    String.prototype.endsWith = function(substr) {
        for (var i=0; i<substr.length; i++) {
            if (this[this.length - 1 - i] !== substr[substr.length - 1 - i]) {
                return false
            }
        }
        return true
    }
}
if (! String.prototype.startsWith) {
    String.prototype.startsWith = function(substr) {
        for (var i=0; i<substr.length; i++) {
            if (this[i] !== substr[i]) {
                return false
            }
        }
        return true
    }
}

// common stuff


    function EntryCache() {
        this.cache = {}
    }
    var EntryCacheprototype = {
        clearTorrent: function() {
            // todo
        },
        clearKey: function(skey) {
            var todelete = []
            for (var key in this.cache) {
                if (key.startsWith(skey)) {
                    todelete.push(key)
                }
            }
            for (var i=0; i<todelete.length; i++) {
                delete this.cache[todelete[i]]
            }
        },
        clear: function() {
            this.cache = {}
        },
        unset: function(k) {
            delete this.cache[k]
        },
        set: function(k,v) {
            this.cache[k] = {v: v};
            // Copy the last-modified date for later verification.
            if (v.lastModifiedDate) {
                this.cache[k].lastModifiedDate = v.lastModifiedDate;
            }
        },
        get: function(k) {
            if (this.cache[k]) {
                var v = this.cache[k].v;
                // If the file was modified, then the file object's last-modified date
                // will be different (greater than) the copied date. In this case the
                // file object will have stale contents so we must invalidate the cache.
                // This happens when reading files from Google Drive.
                if (v.lastModifiedDate && this.cache[k].lastModifiedDate < v.lastModifiedDate) {
                    console.log("invalidate file by lastModifiedDate");
                    this.unset(k);
                    return null;
                } else {
                    return v;
                }
            }
        }
    }
    _.extend(EntryCache.prototype, EntryCacheprototype)

    window.WSC.entryCache = new EntryCache
    window.WSC.entryFileCache = new EntryCache

WSC.recursiveGetEntry = function(filesystem, path, callback) {
    var useCache = false
    // XXX duplication with jstorrent
    var cacheKey = filesystem.filesystem.name +
        filesystem.fullPath +
        '/' + path.join('/')
    var inCache = WSC.entryCache.get(cacheKey)
    if (useCache && inCache) { 
        //console.log('cache hit');
        callback(inCache); return
    }

    var state = {e:filesystem}

    function recurse(e) {
        if (path.length == 0) {
            if (e.name == 'TypeMismatchError') {
                state.e.getDirectory(state.path, {create:false}, recurse, recurse)
            } else if (e.isFile) {
                if (useCache) WSC.entryCache.set(cacheKey,e)
                callback(e)
            } else if (e.isDirectory) {
                //console.log(filesystem,path,cacheKey,state)
                if (useCache) WSC.entryCache.set(cacheKey,e)
                callback(e)
            } else {
                callback({error:'path not found'})
            }
        } else if (e.isDirectory) {
            if (path.length > 1) {
                // this is not calling error callback, simply timing out!!!
                e.getDirectory(path.shift(), {create:false}, recurse, recurse)
            } else {
                state.e = e
                state.path = _.clone(path)
                e.getFile(path.shift(), {create:false}, recurse, recurse)
            }
        } else if (e.name == 'NotFoundError') {
            callback({error:e.name, message:e.message})
        } else {
            callback({error:'file exists'})
        }
    }
    recurse(filesystem)
}

WSC.parseHeaders = function(lines) {
    var headers = {}
    var line
    // TODO - multi line headers?
    for (var i=0;i<lines.length;i++) {
        line = lines[i]
        var j = line.indexOf(':')
        headers[ line.slice(0,j).toLowerCase() ] = line.slice(j+1,line.length).trim()
    }
    return headers
}
function ui82str(arr, startOffset) {
    console.assert(arr)
    if (! startOffset) { startOffset = 0 }
    var length = arr.length - startOffset // XXX a few random exceptions here
    var str = ""
    for (var i=0; i<length; i++) {
        str += String.fromCharCode(arr[i + startOffset])
    }
    return str
}
function ui82arr(arr, startOffset) {
    if (! startOffset) { startOffset = 0 }
    var length = arr.length - startOffset
    var outarr = []
    for (var i=0; i<length; i++) {
        outarr.push(arr[i + startOffset])
    }
    return outarr
}
function str2ab(s) {
    var arr = []
    for (var i=0; i<s.length; i++) {
        arr.push(s.charCodeAt(i))
    }
    return new Uint8Array(arr).buffer
}
    WSC.ui82str = ui82str
WSC.str2ab = str2ab
    WSC.stringToUint8Array = function(string) {
        var encoder = new TextEncoder()
        return encoder.encode(string)
    };

    WSC.arrayBufferToString = function(buffer) {
        var decoder = new TextDecoder()
        return decoder.decode(buffer)
    };
/*
    var logToScreen = function(log) {
        logger.textContent += log + "\n";
    }

*/

function parseUri(str) {
    return new URL(str) // can throw exception, watch out!
}

    
WSC.parseUri = parseUri

    
})();
