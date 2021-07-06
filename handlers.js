(function(){
    _DEBUG = false

    function getEntryFile( entry, callback ) {
        // XXX if file is 0 bytes, and then write some data, it stays cached... which is bad...
        
        var cacheKey = entry.filesystem.name + '/' + entry.fullPath
        var inCache = WSC.entryFileCache.get(cacheKey)
        if (inCache) { 
            //console.log('file cache hit'); 
            callback(inCache); return }
        
        entry.file( function(file) {
            if (false) {
                WSC.entryFileCache.set(cacheKey, file)
            }
            callback(file)
        }, function(evt) {
            // todo -- actually respond with the file error?
            // or cleanup the context at least
            console.error('entry.file() error',evt)
            debugger
            evt.error = true
            // could be NotFoundError
            callback(evt)
        })
    }

    function ProxyHandler(validator, request) {
        WSC.BaseHandler.prototype.constructor.call(this)
        this.validator = validator
    }
    _.extend(ProxyHandler.prototype, {
        get: function() {
            if (! this.validator(this.request)) {
                this.responseLength = 0
                this.writeHeaders(403)
                this.finish()
                return
            }
            console.log('proxyhandler get',this.request)
            var url = this.request.arguments.url
            var xhr = new WSC.ChromeSocketXMLHttpRequest
            var chromeheaders = {
//                'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//                'Accept-Encoding':'gzip, deflate, sdch',
                'Accept-Language':'en-US,en;q=0.8',
                'Cache-Control':'no-cache',
//                'Connection':'keep-alive',
                'Pragma':'no-cache',
                'Upgrade-Insecure-Requests':'1',
                'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.110 Safari/537.36'
            }
            for (var k in chromeheaders) {
                xhr.setRequestHeader(k, chromeheaders[k])
            }
            xhr.open("GET", url)
            xhr.onload = this.onfetched.bind(this)
            xhr.send()
        },
        onfetched: function(evt) {
            for (var header in evt.target.headers) {
                this.setHeader(header, evt.target.headers[header])
            }
            this.responseLength = evt.target.response.byteLength
            this.writeHeaders(evt.target.code)
            this.write(evt.target.response)
            this.finish()
        }
    }, WSC.BaseHandler.prototype)
    WSC.ProxyHandler = ProxyHandler

    function DirectoryEntryHandler(fs, request) {
        WSC.BaseHandler.prototype.constructor.call(this)
        this.fs = fs
        //this.debugInterval = setInterval( this.debug.bind(this), 1000)
        this.entry = null
        this.file = null
        this.readChunkSize = 4096 * 16
        this.fileOffset = 0
        this.fileEndOffset = 0
        this.bodyWritten = 0
        this.isDirectoryListing = false
        request.connection.stream.onclose = this.onClose.bind(this)
    }
    _.extend(DirectoryEntryHandler.prototype, {
        onClose: function() {
            //console.log('closed',this.request.path)
            clearInterval(this.debugInterval)
        },
        debug: function() {
            //console.log(this.request.connection.stream.sockId,'debug wb:',this.request.connection.stream.writeBuffer.size())
        },
        head: function() {
            this.get()
        },
        deletePutHtaccess: function(allow, deny, callback, callbackSkip) {
            if (this.app.opts.optScanForHtaccess) {
                var fullrequestpath = this.request.origpath
                var finpath = fullrequestpath.split('/').pop();
                var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length);
                if (this.request.path == '') {
                    var finalpath = '/'
                }
                var htaccesspath = finalpath+'wsc.htaccess'
                //console.log(htaccesspath)
                this.fs.getByPath(htaccesspath, (file) => {
                    if (! file.error) {
                        file.file( function(filee) {
                            var reader = new FileReader();
                            reader.onload = function(e){
                                var dataa = e.target.result
                                try {
                                    var origdata = JSON.parse(dataa)
                                } catch(e) {
                                    this.responseLength = 0
                                    this.writeHeaders(500)
                                    this.finish()
                                    return
                                }
                                var filerequested = this.request.origpath.split('/').pop();
                                var filefound = false
                                if (origdata.length == 0 || ! origdata.length) {
                                    callback()
                                    return
                                }
                                for (var i=0; i<origdata.length; i++) {
                                    if (! origdata[i].type) {
                                        this.htaccessError.bind(this)('missing type')
                                        return
                                    }
                                    if (! origdata[i].request_path && origdata[i].type != 'directory listing') {
                                        this.htaccessError.bind(this)('missing request path')
                                        return
                                    }
                                    if ((origdata[i].request_path == filerequested && origdata[i].type == 'POSTkey') ||
                                        (origdata[i].request_path == filerequested && origdata[i].type == 'serverSideJavaScript')) {
                                        this.error('bad request', 403)
                                        return
                                    }
                                    if ((origdata[i].type == allow && origdata[i].request_path == filerequested) ||
                                        (origdata[i].type == allow && origdata[i].request_path == 'all files') ||
                                        (origdata[i].type == deny && origdata[i].request_path == filerequested) ||
                                        (origdata[i].type == deny && origdata[i].request_path == 'all files')) {
                                        var data = origdata[i]
                                        var filefound = true
                                        break
                                    }
                                }
                                //console.log(filefound)
                                if (filefound) {
                                    if (data.type == allow) {
                                        callbackSkip()
                                    } else if (data.type == deny) {
                                        this.responseLength = 0
                                        this.writeHeaders(400)
                                        this.finish()
                                        return
                                    }
                                } else {
                                    callback()
                                }
                            }.bind(this)
                            reader.readAsText(filee)
                        }.bind(this))
                    } else {
                        callback()
                    }
                })
            } else {
                callback()
            }
        },
        delete: function() {
            function deleteMain() {
                this.fs.getByPath(this.request.path, (entry) => {
                    entry.remove(()=>{
                        this.responseLength = 0
                        this.writeHeaders(200)
                        this.finish()
                    });
                });
            }
            function deleteCheck() {
                if (! this.app.opts.optDelete) {
                    this.responseLength = 0
                    this.writeHeaders(400)
                    this.finish()
                    return
                } else {
                    deleteMain.bind(this)()
                }
            }
            this.deletePutHtaccess('allow delete', 'deny delete', deleteCheck.bind(this), deleteMain.bind(this))
        },
        post: function() {
            var htaccessPath = WSC.utils.stripOffFile(this.request.origpath)
            this.fs.getByPath(htaccessPath + 'wsc.htaccess', function(file) {
                if (file && ! file.error) {
                    file.file( function(file) {
                        var reader = new FileReader()
                        reader.onload = function(e){
                            try {
                                var origdata = JSON.parse(e.target.result)
                            } catch(e) {
                                this.write('Htaccess JSON parse error\n\nError: ' + e, 500)
                                this.finish()
                                return
                            }
                            if (origdata.length == 0 || ! origdata.length) {
                                this.write('htaccess has no length value', 500)
                                this.finish()
                                return
                            }
                            var filerequested = this.request.origpath.split('/').pop()
                            var filefound = false
                            for (var i=0; i<origdata.length; i++) {
                                if (! origdata[i].type) {
                                    this.htaccessError.bind(this)('missing type')
                                    return
                                }
                                if (! origdata[i].request_path && origdata[i].type != 'directory listing') {
                                    this.htaccessError.bind(this)('missing request path')
                                    return
                                }
                                if (origdata[i].request_path == filerequested && origdata[i].type == 'POSTkey' && ! filefound) {
                                    var data = origdata[i]
                                    var filefound = true
                                    break
                                }
                            }
                            // Still need to validate POST key
                            if (filefound) {
                                if (! data.key) {
                                    this.htaccessError.bind(this)('missing post key')
                                    return
                                }
                                this.fs.getByPath(this.request.path, function(file) {
                                    if (file && ! file.error) {
                                        file.file(function(file) {
                                            var reader = new FileReader()
                                            reader.onload = function(e) {
                                                var contents = e.target.result.split('\n')
                                                var validFile = false
                                                for (var i=0; i<contents.length; i++) {
                                                    contents[i] = contents[i].replaceAll('\t', '').replaceAll('\n', '').replaceAll('\r', '')
                                                    if (contents[i].startsWith('postKey')) {
                                                        var postkey = contents[i].split('=').pop().replaceAll(' ', '').replaceAll('"', '').replaceAll('\'', '')
                                                        if (postkey == data.key) {
                                                            var validFile = true
                                                            break
                                                        }
                                                    }
                                                }
                                                if (validFile) {
                                                    window.req = this.request
                                                    window.res = this
                                                    window.httpRequest = WSC.ChromeSocketXMLHttpRequest
                                                    this.postRequestID = Math.random().toString()
                                                    res.end = function() {
                                                        // We need to cleanup - Which is why we don't want the user to directly call res.finish()
                                                        if (document.getElementById('tempPOSThandler' + this.postRequestID)) {
                                                            document.getElementById('tempPOSThandler' + this.postRequestID).remove()
                                                        }
                                                        delete this.postRequest
                                                        delete window.res
                                                        delete window.req
                                                        delete window.httpRequest
                                                        if (window.postKey) {
                                                            delete window.postKey
                                                        }
                                                        this.finish()
                                                    }
                                                    var blob = new Blob([file], {type : 'text/javascript'})
                                                    this.postRequest = document.createElement("script")
                                                    this.postRequest.src = URL.createObjectURL(blob)
                                                    this.postRequest.id = 'tempPOSThandler' + this.postRequestID
                                                    document.body.appendChild(this.postRequest)
                                                } else {
                                                    this.write('Keys do not match', 403)
                                                }
                                            }.bind(this)
                                            reader.readAsText(file)
                                        }.bind(this))
                                    } else {
                                        this.write('file not found', 404)
                                    }
                                }.bind(this))
                            } else {
                                this.write('file not found', 404)
                            }
                        }.bind(this)
                        reader.readAsText(file)
                    }.bind(this))
                } else {
                    this.write('file not found', 404)
                }
            }.bind(this))
        },
        put: function() {
            function putMain() {
                this.fs.getByPath(this.request.path, this.onPutEntry.bind(this), true)
            }
            function putCheck() {
                if (! this.app.opts.optUpload) {
                    this.responseLength = 0
                    this.writeHeaders(400)
                    this.finish()
                    return
                } else {
                    putMain.bind(this)()
                }
            }
            this.deletePutHtaccess('allow put', 'deny put', putCheck.bind(this), putMain.bind(this))
        },
        onPutEntry: function(entry) {
            var parts = this.request.path.split('/')
            var path = parts.slice(0,parts.length-1).join('/')
            var filename = parts[parts.length-1]

            if (entry && entry.error == 'path not found') {
                // good, we can upload it here ...
                this.fs.getByPath(path, this.onPutFolder.bind(this,filename))
            } else {
                console.log('file already exists', entry)
                if (this.app.opts.optAllowReplaceFile) {
                    // truncate file
                    var onremove = function(evt) {
                        this.fs.getByPath(path, this.onPutFolder.bind(this,filename))
                    }.bind(this)
                    entry.remove( onremove, onremove )
                } else {
                    this.responseLength = 0
                    this.writeHeaders(400)
                    this.finish()
                    return
                }
            }
        },
        onPutFolder: function(filename, folder) {
            var onwritten = function(evt) {
                console.log('write complete',evt)
                this.responseLength = 0
                this.writeHeaders(200)
                this.finish()
            }.bind(this)
            var body = this.request.body
            function onfile(entry) {
                if (entry && entry.isFile) {
                    function onwriter(writer) {
                        writer.onwrite = writer.onerror = onwritten
                        writer.write(new Blob([body]))
                    }
                    entry.createWriter(onwriter, onwriter)
                }
            }
            folder.getFile(filename, {create:true}, onfile, onfile)
        },
        get: function() {
            //this.request.connection.stream.onWriteBufferEmpty = this.onWriteBufferEmpty.bind(this)

            this.setHeader('accept-ranges','bytes')
            this.setHeader('connection','keep-alive')
            if (! this.fs) {
                this.write("error: need to select a directory to serve",500)
                return
            }
            this.request.isVersioning == false
            //var path = decodeURI(this.request.path)

            if (this.app.opts.optCacheControl) {
                this.setHeader('Cache-Control',this.app.opts.optCacheControlValue)
            }
            if (this.app.opts.optExcludeDotHtml && ! this.request.origpath.endsWith("/")) {
                var htmhtml = this.app.opts.optExcludeDotHtm ? 'htm' : 'html';
                var extension = this.request.path.split('.').pop();
                var more = this.request.uri.split('.'+htmhtml).pop()
                if (extension == htmhtml) {
                    var path = this.request.path
                    if (htmhtml == 'html') {
                        var newpath = path.substring(0, path.length - 5);
                    } else {
                        var newpath = path.substring(0, path.length - 4);
                    }
                    if (more != this.request.uri) {
                        var newpath = newpath+more
                    }
                    this.responseLength = 0
                    this.setHeader('location', newpath)
                    this.writeHeaders(307)
                    this.finish()
                    return
                }
            }

            if (this.rewrite_to) {
                this.fs.getByPath(this.rewrite_to, this.onEntry.bind(this))
            } else if (this.fs.isFile) {
                this.onEntry(this.fs)
            } else {
                this.fs.getByPath(this.request.path, this.onEntry.bind(this))
            }
        },
        doReadChunk: function() {
            //console.log(this.request.connection.stream.sockId, 'doReadChunk', this.fileOffset)
            var reader = new FileReader;

            var endByte = Math.min(this.fileOffset + this.readChunkSize,
                                   this.fileEndOffset)
            if (endByte >= this.file.size) {
                console.error('bad readChunk')
                console.assert(false)
            }

            //console.log('doReadChunk',this.fileOffset,endByte-this.fileOffset)
            reader.onload = this.onReadChunk.bind(this)
            reader.onerror = this.onReadChunk.bind(this)
            var blobSlice = this.file.slice(this.fileOffset, endByte + 1)
            var oldOffset = this.fileOffset
            this.fileOffset += (endByte - this.fileOffset) + 1
            //console.log('offset',oldOffset,this.fileOffset)
            reader.readAsArrayBuffer(blobSlice)
        },
        onWriteBufferEmpty: function() {
            if (! this.file) {
                console.error('!this.file')
                debugger
                return
            }
            console.assert( this.bodyWritten <= this.responseLength )
            //console.log('onWriteBufferEmpty', this.bodyWritten, '/', this.responseLength)
            if (this.bodyWritten > this.responseLength) {
                console.assert(false)
            } else if (this.bodyWritten == this.responseLength) {
                this.request.connection.stream.onWriteBufferEmpty = null
                this.finish()
                return
            } else {
                if (this.request.connection.stream.remoteclosed) {
                    this.request.connection.close()
                    // still read?
                } else if (! this.request.connection.stream.closed) {
                    this.doReadChunk()
                }
            }
        },
        onReadChunk: function(evt) {
            //console.log('onReadChunk')
            if (evt.target.result) {
                this.bodyWritten += evt.target.result.byteLength
                if (this.bodyWritten >= this.responseLength) {
                    //this.request.connection.stream.onWriteBufferEmpty = null
                }
                //console.log(this.request.connection.stream.sockId,'write',evt.target.result.byteLength)
                this.request.connection.write(evt.target.result)
            } else {
                console.error('onreadchunk error',evt.target.error)
                this.request.connection.close()
            }
        },
        onEntry: function(entry) {
            this.entry = entry

            function onEntryMain() {
                
                if (this.entry && this.entry.isFile && this.request.origpath.endsWith('/')) {
                    this.setHeader('location', this.request.path)
                    this.writeHeaders(301)
                    this.finish()
                    return
                }
                
                if (this.entry && this.entry.isDirectory && ! this.request.origpath.endsWith('/')) {
                    var newloc = this.request.origpath + '/'
                    this.setHeader('location', newloc) // XXX - encode latin-1 somehow?
                    this.responseLength = 0
                    //console.log('redirect ->',newloc)
                    this.writeHeaders(301)
                    this.finish()
                    return
                }

                if (this.request.connection.stream.closed) {
                    console.warn(this.request.connection.stream.sockId,'request closed while processing request')
                    return
                }
                if (! entry) {
                    this.error('no entry',404)
                } else if (entry.error) {
                    this.error('entry not found: ' + (this.rewrite_to || this.request.path), 404)
                } else if (entry.isFile) {
                    this.renderFileContents(entry)
                } else {
                    // directory

                    function alldone(results) {
                        if (this.app.opts.optRenderIndex) {
                            for (var i=0; i<results.length; i++) {
                                if (results[i].name.toLowerCase() == 'index.xhtml' || results[i].name.toLowerCase() == 'index.xhtm') {
                                    this.setHeader('content-type','application/xhtml+xml; charset=utf-8')
                                    this.renderFileContents(results[i])
                                    return
                                }
                                else if (results[i].name.toLowerCase() == 'index.html' || results[i].name.toLowerCase() == 'index.htm') {
                                    this.setHeader('content-type','text/html; charset=utf-8')
                                    this.renderFileContents(results[i])
                                    return
                                }
                            }
                        }
                        if (this.app.opts.optDir404 && this.app.opts.optRenderIndex) {
                            this.error("404 - File not found", 404)
                        } else if (this.request.arguments && this.request.arguments.json == '1' ||
                            (this.request.headers['accept'] && this.request.headers['accept'].toLowerCase() == 'application/json')
                           ) {
                            this.renderDirectoryListingJSON(results)
                        } else if (this.request.arguments && this.request.arguments.static == '1' ||
                            this.request.arguments.static == 'true' ||
                            this.app.opts.optStatic
                           ) {
                            this.renderDirectoryListing(results)
                        } else {
                            this.renderDirectoryListingTemplate(results)
                        }
                    }
                    this.getDirContents(entry, alldone.bind(this))
                }
            }

            function excludedothtmlcheck() {
                if (this.app.opts.optExcludeDotHtml && this.request.path != '') {
                    if (this.app.opts.optExcludeDotHtm) {
                        var htmHtml = '.htm'
                    } else {
                        var htmHtml = '.html'
                    }
                    this.fs.getByPath(this.request.path+htmHtml, (file) => {
                    if (! file.error) {
                        if (this.request.origpath.endsWith("/")) {
                            onEntryMain.bind(this)()
                            return
                        }
                        this.renderFileContents(file)
                        //console.log('file found')
                        this.setHeader('content-type','text/html; charset=utf-8')
                        return
                    } else {
                        onEntryMain.bind(this)()
                        }
                    })} else {
                    onEntryMain.bind(this)()
                }
            }
        
            if (this.app.opts.optScanForHtaccess) {
                var fullrequestpath = this.request.origpath
                var finpath = fullrequestpath.split('/').pop();
                var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length);
                if (this.request.path == '') {
                    var finalpath = '/'
                }
                var htaccesspath = finalpath+'wsc.htaccess'
                this.fs.getByPath(htaccesspath, (file) => {
                    if (! file.error && file.isFile) {
                        file.file( function(filee) {
                            var reader = new FileReader();
                            reader.onload = function(e){
                                var dataa = e.target.result
                                if(true) {
                                    try {
                                        var origdata = JSON.parse(dataa)
                                    } catch(e) {
                                        this.write('<p>wsc.htaccess file found, but it is not a valid json array. Please read the htaccess readme <a href="https://github.com/ethanaobrien/web-server-chrome/blob/master/htaccess/README.md">here</a></p>\n\n\n'+e, 500)
                                        this.finish()
                                        console.error('htaccess json array error')
                                        return
                                    }
                                }

                                function htaccessMain(filerequested) {
                                    var filefound = false
                                    var auth = false
                                    var authdata = false
                                    var j=0
                                    var data = false
                                    var htaccessHeaders = [ ]
                                    var additionalHeaders = false
                                    if (origdata.length == 0 || ! origdata.length) {
                                        excludedothtmlcheck.bind(this)()
                                        return
                                    }
                                    for (var i=0; i<origdata.length; i++) {
                                        if (! origdata[i].type) {
                                            this.htaccessError.bind(this)('missing type')
                                            return
                                        }
                                        if (! origdata[i].request_path && origdata[i].type != 'directory listing') {
                                            this.htaccessError.bind(this)('missing request path')
                                            return
                                        }
                                        origdata[i].original_request_path = origdata[i].request_path
                                        origdata[i].filerequested = filerequested
                                        origdata[i].request_path = WSC.utils.htaccessFileRequested(origdata[i].request_path)
                                        if (origdata[i].type == 401 &&
                                            ! auth &&
                                            (origdata[i].request_path == filerequested || origdata[i].request_path == 'all files') && ! this.request.isVersioning) {
                                            var auth = true
                                            var authdata = origdata[i]
                                        }
                                        if (origdata[i].type == 'directory listing' &&
                                            this.request.origpath.split('/').pop() == '' &&
                                            ! filefound) {
                                            var data = origdata[i]
                                            var filefound = true
                                        }
                                        if (origdata[i].type == 'send directory contents' && origdata[i].request_path == filerequested) {
                                            var extension = origdata[i].original_request_path.split('.').pop()
                                            if (extension == 'html' || extension == 'htm') {
                                                var data = origdata[i]
                                                var filefound = true
                                            }
                                        }
                                        if ((origdata[i].request_path == filerequested || origdata[i].request_path == 'all files') &&
                                            ! filefound &&
                                            origdata[i].type != 'allow delete' &&
                                            origdata[i].type != 'allow put' &&
                                            origdata[i].type != 'deny delete' &&
                                            origdata[i].type != 'deny put' &&
                                            origdata[i].type != 401 &&
                                            origdata[i].type != 'directory listing' &&
                                            origdata[i].type != 'additional header' &&
                                            origdata[i].type != 'send directory contents' &&
                                            origdata[i].type != 'POSTkey') {
                                                var data = origdata[i]
                                                //console.log(data)
                                                var filefound = true
                                        }
                                        if (origdata[i].request_path == filerequested && origdata[i].type == 'POSTkey') {
                                            var filefound = false
                                            this.error('<h1>403 - Forbidden</h1>')
                                            break
                                        }
                                        //console.log(origdata[i].request_path == filerequested)
                                        if ((origdata[i].request_path == filerequested || origdata[i].request_path == 'all files') &&
                                            origdata[i].type == 'additional header') {
                                            //console.log('additional header')
                                            var additionalHeaders = true
                                            htaccessHeaders[j] = origdata[i]
                                            j++
                                        }
                                    }
                                    //console.log(data)
                                    //console.log(authdata)
                                    //console.log(filefound)
                                    function htaccessCheck2() {
                                        if (filefound) {
                                            if (data.type == 301 || data.type == 302 || data.type == 307) {
                                                if (! data.redirto) {
                                                    this.htaccessError.bind(this)('missing redirect location')
                                                    return
                                                }
                                                this.setHeader('location', data.redirto)
                                                this.responseLength = 0
                                                this.writeHeaders(data.type)
                                                this.finish()
                                            } else if (data.type == 403) {
                                                var method = this.request.headers['sec-fetch-dest']
                                                //console.log(method)
                                                if (method == "document") {
                                                    this.error('<h1>403 - Forbidden</h1>', 403)
                                                } else {
                                                    excludedothtmlcheck.bind(this)()
                                                }
                                            } else if (data.type == 'directory listing') {
                                                function finished(results) {
                                                    if (this.request.arguments.json == '1' ||
                                                        this.request.headers['accept'].toLowerCase() == 'application/json') {
                                                        this.renderDirectoryListingJSON(results)
                                                    } else if (this.request.arguments.static == '1' ||
                                                               this.request.arguments.static == 'true' ||
                                                               this.app.opts.optStatic) {
                                                        this.renderDirectoryListing(results)
                                                    } else {
                                                        this.renderDirectoryListingTemplate(results)
                                                    }
                                                }

                                                this.getDirContents(entry, finished.bind(this))

                                            } else if (data.type == 'send directory contents') {
                                                if (! data.dir_to_send || data.dir_to_send.replace(' ', '') == '') {
                                                    data.dir_to_send = './'
                                                }
                                                function finished(results) {
                                                    var fullrequestpath = this.request.origpath
                                                    var finpath = fullrequestpath.split('/').pop();
                                                    var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length) + data.original_request_path
                                                    //console.log(filepath)
                                                    this.fs.getByPath(finalpath, (file) => {
                                                        if (! file.error && file.isFile) {
                                                            file.file( function(file) {
                                                                var reader = new FileReader();
                                                                reader.onload = function(e){
                                                                    function finish() {
                                                                        var data = html.join('\n')
                                                                        this.setHeader('content-type','text/html; charset=utf-8')
                                                                        this.write(data, 200)
                                                                        this.finish()
                                                                    }
                                                                    function sendFile() {
                                                                        results[i].getMetadata(function(filee) {
                                                                            var rawname = results[i].name
                                                                            var name = encodeURIComponent(results[i].name)
                                                                            var isdirectory = results[i].isDirectory
                                                                            var filesize = filee.size
                                                                            var modified = WSC.utils.lastModified(filee.modificationTime)
                                                                            var filesizestr = WSC.utils.humanFileSize(filee.size)
                                                                            var modifiedstr = WSC.utils.lastModifiedStr(filee.modificationTime)
                                                                            if (rawname != 'wsc.htaccess') {
                                                                                html.push('<script>addRow("'+rawname+'", "'+name+'", '+isdirectory+', '+filesize+', "'+filesizestr+'", '+modified+', "'+modifiedstr+'")</script>')
                                                                            }
                                                                            if (i != results.length - 1) {
                                                                                i++
                                                                                sendFile.bind(this, results)()
                                                                            } else {
                                                                                finish.bind(this, results)()
                                                                            }
                                                                        }.bind(this), function(error) {
                                                                            console.error('error reading metadata '+error)
                                                                            if (i != results.length - 1) {
                                                                                i++
                                                                                sendFileList.bind(this, results)()
                                                                            } else {
                                                                                DirRenderFinish.bind(this, results)()
                                                                            }
                                                                        }.bind(this))
                                                                    }
                                                                    var html = [e.target.result]
                                                                    var i = 0
                                                                    sendFile.bind(this, results)()
                                                                }.bind(this)
                                                                reader.readAsText(file)
                                                            }.bind(this))
                                                        } else {
                                                            this.write('An unexpected error occured. Please check your wsc.htaccess file for any configuration errors.\nPlease remember, the send directory listing feature CANNOT use "all files", you must specify each file separately.\nPlease check your settings. If everything seems to be in place, please report an issue on github.\n\nhttps://github.com/kzahel/web-server-chrome\n\nPlease copy and paste the following information.\n\n\nfilepath: '+filepath+'\nrequestURI: '+this.request.uri+'\nrequested file (according to htaccess): '+data.original_request_path+'\nrequested file (according to requestURI): '+data.filerequested, 500)
                                                            this.finish()
                                                        }
                                                    })
                                                }
                                                var path2Send = data.dir_to_send
                                                var fullrequestpath = this.request.origpath
                                                var finpath = fullrequestpath.split('/').pop();
                                                var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length);
                                                if (this.request.path == '') {
                                                    var finalpath = '/'
                                                }
                                                var split1 = finalpath.split('/')
                                                var split2 = path2Send.split('/')
                                                
                                                if (! path2Send.startsWith('/')) {
                                                    for (var w=0; w<split2.length; w++) {
                                                        if (split2[w] == '' || split2[w] == '.') {
                                                            // . means current directory. Leave this here for spacing
                                                        } else if (split2[w] == '..') {
                                                            if (split1.length > 0) {
                                                                var split1 = split1.splice(-1,1)
                                                            }
                                                        } else {
                                                            split1.push(split2[w])
                                                        }
                                                    }
                                                    var path2Send = split1.join('/')
                                                    if (! path2Send.startsWith('/')) {
                                                        var path2Send = '/' + path2Send
                                                    }
                                                }
                                                
                                                //console.log(finalpath)
                                                //console.log(data)
                                                this.fs.getByPath(path2Send, function(entryy) {
                                                    if (! entry.error) {
                                                        this.getDirContents(entryy, finished.bind(this))
                                                    } else {
                                                        this.htaccessError.bind(this)('invalid path to send dir contents')
                                                    }
                                                }.bind(this))
                                            } else if (data.type == 'versioning') {
                                                //console.log('versioning')
                                                if (! data.version_data || data.version_data.length == 0) {
                                                    this.htaccessError.bind(this)('missing version data')
                                                    return
                                                }
                                                if (! data.variable) {
                                                    this.htaccessError.bind(this)('missing variable')
                                                    return
                                                }
                                                if (! data.default) {
                                                    this.htaccessError.bind(this)('missing default file selection')
                                                    return
                                                }
                                                var versionData = data.version_data
                                                var vdata4 = this.request.arguments[data.variable]
                                                if ( ! versionData[vdata4]) {
                                                    vdata4 = data.default
                                                }
                                                var vdataa = versionData[vdata4]
                                                var fullrequestpath = this.request.origpath
                                                var finpath = fullrequestpath.split('/').pop();
                                                var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length);
                                                if (this.request.path == '') {
                                                    var finalpath = '/'
                                                }
                                                var split1 = finalpath.split('/')
                                                var split2 = vdataa.split('/')
                                                if (! vdataa.startsWith('/')) {
                                                    for (var w=0; w<split2.length; w++) {
                                                        if (split2[w] == '' || split2[w] == '.') {
                                                            // . means current directory. Leave this here for spacing
                                                        } else if (split2[w] == '..') {
                                                            if (split1.length > 0) {
                                                                var split1 = split1.splice(-1,1)
                                                            }
                                                        } else {
                                                            split1.push(split2[w])
                                                        }
                                                    }
                                                    var vdataa = split1.join('/')
                                                    if (! vdataa.startsWith('/')) {
                                                        var vdataa = '/' + vdataa
                                                    }
                                                    //console.log(vdataa)
                                                }
                                                //console.log(vdataa)
                                                this.fs.getByPath(vdataa, function(file) {
                                                    if (file && ! file.error) {
                                                        this.request.path = vdataa
                                                        if (file.isFile) {
                                                            this.request.origpath = vdataa
                                                            this.request.uri = vdataa
                                                        } else {
                                                            if (vdataa.endsWith("/")) {
                                                                this.request.origpath = vdataa
                                                                this.request.uri = vdataa
                                                            } else {
                                                                this.request.origpath = vdataa+'/'
                                                                this.request.uri = vdataa+'/'
                                                            }
                                                        }
                                                        this.request.isVersioning = true
                                                        this.onEntry(file)
                                                    } else {
                                                        this.write('path in htaccess file for version '+vdata4+' is missing or the file does not exist. Please check to make sure you have properly inputed the value', 500)
                                                    }
                                                }.bind(this))
                                            } else if (data.type == 'serverSideJavaScript') {
                                                if (! data.key) {
                                                    this.htaccessError.bind(this)('missing key')
                                                    return
                                                }
                                                this.fs.getByPath(this.request.path, function(file) {
                                                    if (file && ! file.error) {
                                                        file.file(function(file) {
                                                            var reader = new FileReader()
                                                            reader.onload = function(e) {
                                                                var contents = e.target.result.split('\n')
                                                                var validFile = false
                                                                for (var i=0; i<contents.length; i++) {
                                                                    contents[i] = contents[i].replaceAll('\t', '').replaceAll('\n', '').replaceAll('\r', '')
                                                                    if (contents[i].startsWith('SSJSKey')) {
                                                                        var SSJSKey = contents[i].split('=').pop().replaceAll(' ', '').replaceAll('"', '').replaceAll('\'', '')
                                                                        if (SSJSKey == data.key) {
                                                                            var validFile = true
                                                                            break
                                                                        }
                                                                    }
                                                                }
                                                                if (validFile) {
                                                                    window.req = this.request
                                                                    window.res = this
                                                                    window.httpRequest = WSC.ChromeSocketXMLHttpRequest
                                                                    this.getRequestID = Math.random().toString()
                                                                    res.end = function() {
                                                                        // We need to cleanup - Which is why we don't want the user to directly call res.finish()
                                                                        if (document.getElementById('tempGEThandler' + this.getRequestID)) {
                                                                            document.getElementById('tempGEThandler' + this.getRequestID).remove()
                                                                        }
                                                                        delete this.getRequest
                                                                        delete window.res
                                                                        delete window.req
                                                                        delete window.httpRequest
                                                                        if (window.SSJSKey) {
                                                                            delete window.SSJSKey
                                                                        }
                                                                        this.finish()
                                                                    }
                                                                    var blob = new Blob([file], {type : 'text/javascript'})
                                                                    this.getRequest = document.createElement("script")
                                                                    this.getRequest.src = URL.createObjectURL(blob)
                                                                    this.getRequest.id = 'tempGEThandler' + this.getRequestID
                                                                    document.body.appendChild(this.getRequest)
                                                                } else {
                                                                    this.write('Keys do not match', 403)
                                                                }
                                                            }.bind(this)
                                                            reader.readAsText(file)
                                                        }.bind(this))
                                                    } else {
                                                        this.write('file not found', 404)
                                                    }
                                                }.bind(this))
                                            } else {
                                                excludedothtmlcheck.bind(this)()
                                            }
                                        } else {
                                            excludedothtmlcheck.bind(this)()
                                        }
                                    }
                                    //console.log(htaccessHeaders)
                                    if (additionalHeaders) {
                                        for (var i=0; i<htaccessHeaders.length; i++) {
                                            this.setHeader(htaccessHeaders[i].headerType, htaccessHeaders[i].headerValue)
                                        }
                                    }
                                    if (auth && authdata.type == 401) {
                                         if (! authdata.username) {
                                             this.htaccessError.bind(this)('missing Auth Username')
                                             return
                                         }
                                         if (! authdata.password) {
                                             this.htaccessError.bind(this)('missing Auth Password')
                                             return
                                         }
                                            var validAuth = false
                                            var auth = this.request.headers['authorization']
                                            if (auth) {
                                                if (auth.slice(0,6).toLowerCase() == 'basic ') {
                                                    var userpass = atob(auth.slice(6,auth.length)).split(':')
                                                    if (userpass[0] == authdata.username && userpass[1] == authdata.password) {
                                                        validAuth = true
                                                    }
                                                }
                                            }
                                            if (! validAuth) {
                                                this.error("<h1>401 - Unauthorized</h1>", 401)
                                            }
                                            if (validAuth) {
                                                htaccessCheck2.bind(this)()
                                            }
                                    } else {
                                        htaccessCheck2.bind(this)()
                                    }
                                }
                                var filerequest = this.request.origpath

                                if (this.app.opts.optExcludeDotHtml) {
                                    var htmHtml = this.app.opts.optExcludeDotHtm ? '.htm' : '.html'
                                    this.fs.getByPath(this.request.path+htmHtml, (file) => {
                                        if (! file.error) {
                                            if (this.request.origpath.endsWith("/")) {
                                                htaccessMain.bind(this)('')
                                                return
                                            }
                                            var filerequested = this.request.path+htmHtml
                                            var filerequested = filerequested.split('/').pop();
                                            var filerequested = WSC.utils.htaccessFileRequested(filerequested)
                                            htaccessMain.bind(this)(filerequested)
                                            return
                                        } else {
                                            if (this.entry && this.entry.isDirectory && ! this.request.origpath.endsWith('/')) {
                                                var newloc = this.request.origpath + '/'
                                                this.setHeader('location', newloc)
                                                this.responseLength = 0
                                                this.writeHeaders(301)
                                                this.finish()
                                                return
                                            }
                                            var filerequested = filerequest.split('/').pop();
                                            //console.log(filerequested)
                                            var filerequested = WSC.utils.htaccessFileRequested(filerequested)
                                                htaccessMain.bind(this)(filerequested)
                                                return
                                        }
                                    })
                                } else {
                                    if (this.entry && this.entry.isDirectory && ! this.request.origpath.endsWith('/')) {
                                        var newloc = this.request.origpath + '/'
                                        this.setHeader('location', newloc)
                                        this.responseLength = 0
                                        this.writeHeaders(301)
                                        this.finish()
                                        return
                                    }
                                    var filerequested = filerequest.split('/').pop();
                                    //console.log(filerequested)
                                    var filerequested = WSC.utils.htaccessFileRequested(filerequested)
                                    htaccessMain.bind(this)(filerequested)
                                    return
                                }
                            }.bind(this)
                            reader.readAsText(filee)
                        }.bind(this))
                    } else {
                        excludedothtmlcheck.bind(this)()
                    }
                })
            } else {
                excludedothtmlcheck.bind(this)()
            }
        },
        renderFileContents: function(entry, file) {
            getEntryFile(entry, function(file) {
                if (file instanceof DOMException) {
                    this.error("File not found", 404)
                }
                this.file = file
                if (this.request.method == "HEAD") {
                    this.responseLength = this.file.size
                    this.writeHeaders(200)
                    this.finish()

                } else if (this.file.size > this.readChunkSize * 8 ||
                           this.request.headers['range']) {
                    this.request.connection.stream.onWriteBufferEmpty = this.onWriteBufferEmpty.bind(this)

                    if (this.request.headers['range']) {
                        console.log(this.request.connection.stream.sockId,'RANGE',this.request.headers['range'])

                        var range = this.request.headers['range'].split('=')[1].trim()

                        var rparts = range.split('-')
                        if (! rparts[1]) {
                            this.fileOffset = parseInt(rparts[0])
                            this.fileEndOffset = this.file.size - 1
                            this.responseLength = this.file.size - this.fileOffset;
                            this.setHeader('content-range','bytes '+this.fileOffset+'-'+(this.file.size-1)+'/'+this.file.size)
                            if (this.fileOffset == 0) {
                                this.writeHeaders(200)
                            } else {
                                this.writeHeaders(206)
                            }

                        } else {
                            //debugger // TODO -- add support for partial file fetching...
                            //this.writeHeaders(500)
                            this.fileOffset = parseInt(rparts[0])
                            this.fileEndOffset = parseInt(rparts[1])
                            this.responseLength = this.fileEndOffset - this.fileOffset + 1
                            this.setHeader('content-range','bytes '+this.fileOffset+'-'+(this.fileEndOffset)+'/'+this.file.size)
                            this.writeHeaders(206)
                        }


                    } else {
                        if (_DEBUG) {
                            console.log('large file, streaming mode!')
                        }
                        this.fileOffset = 0
                        this.fileEndOffset = this.file.size - 1
                        this.responseLength = this.file.size
                        this.writeHeaders(200)
                    }
                } else {
                    //console.log(entry,file)
                    var fr = new FileReader
                    var cb = this.onReadEntry.bind(this)
                    fr.onload = cb
                    fr.onerror = cb
                    fr.readAsArrayBuffer(file)
                }
            }.bind(this))
        },
        entriesSortFunc: function(a,b) {
            var anl = a.name.toLowerCase()
            var bnl = b.name.toLowerCase()
            if (a.isDirectory && b.isDirectory) {
                return anl.localeCompare(bnl)
            } else if (a.isDirectory) {
                return -1
            } else if (b.isDirectory) {
                return 1
            } else {
                /// both files
                return anl.localeCompare(bnl)
            }
                
        },
        renderDirectoryListingJSON: function(results) {
            this.setHeader('content-type','application/json; charset=utf-8')
            this.write(JSON.stringify(results.map(function(f) { return { name:f.name,
                                                                         fullPath:f.fullPath,
                                                                         isFile:f.isFile,
                                                                         isDirectory:f.isDirectory }
                                                              }), null, 2))
        },
        renderDirectoryListingTemplate: function(results) {
            if (! WSC.template_data) {
                return this.renderDirectoryListing(results)
            }
            function DirRenderFinish() {
                this.setHeader('content-type','text/html; charset=utf-8')
                this.write(html.join('\n'))
                this.finish()
            }
            function sendFileList() {
                results[w].getMetadata(function(file) {
                    //console.log(file)
                    var rawname = results[w].name
                    var name = encodeURIComponent(results[w].name)
                    var isdirectory = results[w].isDirectory
                    //var modified = '4/27/21, 10:38:40 AM'
                    var modified = WSC.utils.lastModified(file.modificationTime)
                    var filesize = file.size
                    var filesizestr = WSC.utils.humanFileSize(file.size)
                    var modifiedstr = WSC.utils.lastModifiedStr(file.modificationTime)
                    // raw, urlencoded, isdirectory, size, size as string, date modified, date modified as string
                    if (rawname != 'wsc.htaccess') {
                        html.push('<script>addRow("'+rawname+'","'+name+'",'+isdirectory+',"'+filesize+'","'+filesizestr+'","'+modified+'","'+modifiedstr+'");</script>')
                    }
                    if (w != results.length - 1) {
                        w++
                        sendFileList.bind(this, results)()
                    } else {
                        DirRenderFinish.bind(this, results)()
                    }
                }.bind(this), function(error) {
                    console.error('error reading metadata '+error)
                    if (w != results.length - 1) {
                        w++
                        sendFileList.bind(this, results)()
                    } else {
                        DirRenderFinish.bind(this, results)()
                    }
                }.bind(this))
            }
            var html = [WSC.template_data]
            html.push('<script>start("'+this.request.origpath+'")</script>')
            if (this.request.origpath != '/') {
                html.push('<script>onHasParentDirectory();</script>')
            }
            var w = 0
            if (results.length == 0) {
                DirRenderFinish.bind(this)()
                return
            }
            sendFileList.bind(this, results)()
        },
        renderDirectoryListing: function(results) {
            var html = ['<html>']
            html.push('<style>li.directory {background:#aab}</style>')
            html.push('<a href="../?static=1">parent</a>')
            html.push('<ul>')
            results.sort( this.entriesSortFunc )
            
            // TODO -- add sorting (by query parameter?) show file size?

            for (var i=0; i<results.length; i++) {
                var name = _.escape(results[i].name)
                if (results[i].isDirectory) {
                    html.push('<li class="directory"><a href="' + name + '/?static=1">' + name + '</a></li>')
                } else {
                    if (name != 'wsc.htaccess') {
                        html.push('<li><a href="' + name + '?static=1">' + name + '</a></li>')
                    }
                }
            }
            html.push('</ul></html>')
            this.setHeader('content-type','text/html; charset=utf-8')
            this.write(html.join('\n'))
        },
        onReadEntry: function(evt) {
            if (evt.type == 'error') {
                console.error('error reading',evt.target.error)
                // clear this file from cache...
                WSC.entryFileCache.unset( this.entry.filesystem.name + '/' + this.entry.fullPath )

                this.request.connection.close()
            } else {
            // set mime types etc?
                this.write(evt.target.result)
            }

        },
        getDirContents: function(entry, callback) {
               var reader = entry.createReader()
            var allresults = []
            function onreaderr(evt) {
                WSC.entryCache.unset(this.entry.filesystem.name + this.entry.fullPath)
                console.error('error reading dir',evt)
                this.request.connection.close()
            }
            function onreadsuccess(results) {
                if (results.length == 0) {
                    callback(allresults)
                } else {
                    allresults = allresults.concat( results )
                    reader.readEntries( onreadsuccess.bind(this),
                                        onreaderr.bind(this) )
                }
            }
            reader.readEntries( onreadsuccess.bind(this),
                                onreaderr.bind(this))
        },
        htaccessError: function(errormsg) {
            this.write('Htaccess Configuration error. Please check to make sure that you are not missing some values.\n\nError Message: '+errormsg, 500)
            this.finish()
            return
        },
        // everything from here to the end of the prototype are tools for server side post handling
        getFile: function(path, callback) {
            if (! path.startsWith('/')) {
                var path = WSC.utils.relativePath(path, WSC.utils.stripOffFile(this.request.origpath))
            }
            if (! callback) {
                return
            }
            this.fs.getByPath(path, function(file) {
                if (file.isDirectory) {
                    // automatically get dir contents?
                    this.getDirContents(file, function(results) {
                        results.isDirectory = true
                        results.isFile = false
                        callback(results)
                    })
                } else if (file && ! file.error) {
                    file.file(function(file) {
                        callback(file)
                    })
                } else {
                    callback(file)
                }
                
            }.bind(this))
        },
        writeFile: function(path, data, allowReplaceFile, callback) {
            if (typeof data == "string") {
                var data = new TextEncoder('utf-8').encode(data).buffer
            }
            if (! path.startsWith('/')) {
                var path = WSC.utils.relativePath(path, WSC.utils.stripOffFile(this.request.origpath))
            }
            if (! callback) {
                var callback = function(file) { }
            }
            var parts = path.split('/')
            var folderPath = parts.slice(0,parts.length-1).join('/')
            var filename = parts[parts.length-1]
            this.fs.getByPath(path, function(file) {
                if (file && file.error) {
                    app.fs.getByPath(folderPath, function(folder) {
                        folder.getFile(filename, {create:true}, function(entry) {
                            if (entry && entry.isFile) {
                                entry.createWriter(function(writer) {
                                    writer.onwrite = writer.onerror = function() {
                                        app.fs.getByPath(path, function(file) {
                                            if (file && ! file.error) {
                                                file.file(function(file) {
                                                    callback(file)
                                                })
                                            } else {
                                                callback({error: 'Unknown Error'})
                                            }
                                        })
                                    }
                                    writer.write(new Blob([data]))
                                })
                            } else {
                                callback({error: 'Unknown Error'})
                            }
                        })
                    }, true)
                } else if (! file.isDirectory && allowReplaceFile) {
                    app.fs.getByPath(path, function(entry) {
                        entry.remove(function() {
                            app.fs.getByPath(folderPath, function(folder) {
                                folder.getFile(filename, {create:true}, function(entry) {
                                    if (entry && entry.isFile) {
                                        entry.createWriter(function(writer) {
                                            writer.onwrite = writer.onerror = function() {
                                                app.fs.getByPath(path, function(file) {
                                                    if (file && ! file.error) {
                                                        file.file(function(file) {
                                                            callback(file)
                                                        })
                                                    } else {
                                                        callback({error: 'Unknown Error'})
                                                    }
                                                })
                                            }
                                            writer.write(new Blob([data]))
                                        })
                                    } else {
                                        callback({error: 'Unknown Error'})
                                    }
                                })
                            }, true)
                        })
                    })
                } else if (file.isDirectory) {
                    callback({error: 'entry is an existing directory. Deleting Directories not supported'})
                } else {
                    callback({error: 'File already exists'})
                }
                
                
            }, true)
        },
        httpCode: function(code) {
            if (! code) {
                code = 200
            }
            this.responseLength = 0
            this.writeHeaders(code)
        },
        contentType: function(type) {
            this.setHeader('content-type', type)
        }
    }, WSC.BaseHandler.prototype)

    //if (chrome.runtime.id == WSC.store_id || true) {
    
    chrome.runtime.getPackageDirectoryEntry( function(pentry) {
        var template_filename = 'directory-listing-template.html'
        var onfile = function(e) {
            if (e instanceof DOMException) {
                console.error('template fetch:',e)
            } else {
                var onfile = function(file) {
                    var onread = function(evt) {
                        WSC.template_data = evt.target.result
                    }
                    var fr = new FileReader
                    fr.onload = onread
                    fr.onerror = onread
                    fr.readAsText(file)
                }
                e.file( onfile, onfile )
            }
        }
        pentry.getFile(template_filename,{create:false},onfile,onfile)
    })

    WSC.DirectoryEntryHandler = DirectoryEntryHandler

})();
