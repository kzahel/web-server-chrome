// common stuff

function recursiveGetEntry(filesystem, path, callback) {
    var state = {e:filesystem}

    function recurse(e) {
        console.log('recurse',e)
        if (path.length == 0) {
            if (e.name == 'TypeMismatchError') {
                state.e.getDirectory(state.path, {create:false}, recurse, recurse)
            } else if (e.isFile) {
                callback(e)
            } else if (e.isDirectory) {
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
        } else {
            callback({error:'file exists'})
        }
    }
    recurse(filesystem)
}

function parseHeaders(lines) {
    var headers = {}
    // TODO - multi line headers?
    for (var i=0;i<lines.length;i++) {
        var l = lines[i].split(':')
        headers[l[0].toLowerCase()] = l[1].trim()
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

    var stringToUint8Array = function(string) {
        var buffer = new ArrayBuffer(string.length);
        var view = new Uint8Array(buffer);
        for(var i = 0; i < string.length; i++) {
            view[i] = string.charCodeAt(i);
        }
        return view;
    };

    var arrayBufferToString = function(buffer) {
        var str = '';
        var uArrayVal = new Uint8Array(buffer);
        for(var s = 0; s < uArrayVal.length; s++) {
            str += String.fromCharCode(uArrayVal[s]);
        }
        return str;
    };
/*
    var logToScreen = function(log) {
        logger.textContent += log + "\n";
    }

*/
