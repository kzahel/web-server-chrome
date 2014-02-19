// common stuff

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
