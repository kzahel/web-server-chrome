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
            this.is404html = false
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
        delete: function() {
            this.is404html = false
            if (! this.app.opts.optDelete) {
                this.responseLength = 0
                this.writeHeaders(400)
                this.finish()
                return
            }
            this.fs.getByPath(this.request.path, (entry) => {
                entry.remove(()=>{
                    this.responseLength = 0
                    this.writeHeaders(200)
                    this.finish()
                });
            });
        },
        put: function() {
            this.is404html = false
            if (! this.app.opts.optUpload) {
                this.responseLength = 0
                this.writeHeaders(400)
                this.finish()
                return
            }

            // if upload enabled in options...
            // check if file exists...
            this.fs.getByPath(this.request.path, this.onPutEntry.bind(this), true)
        },
        onPutEntry: function(entry) {
            this.is404html = false
            var parts = this.request.path.split('/')
            var path = parts.slice(0,parts.length-1).join('/')
            var filename = parts[parts.length-1]

            if (entry && entry.error == 'path not found') {
                // good, we can upload it here ...
                this.fs.getByPath(path, this.onPutFolder.bind(this,filename))
            } else {
                var allowReplaceFile = true
                console.log('file already exists', entry)
                if (allowReplaceFile) {
                    // truncate file
                    var onremove = function(evt) {
                        this.fs.getByPath(path, this.onPutFolder.bind(this,filename))
                    }.bind(this)
                    entry.remove( onremove, onremove )
                }
            }
        },
        onPutFolder: function(filename, folder) {
            this.is404html = false
            var onwritten = function(evt) {
                console.log('write complete',evt)
                // TODO write 400 in other cases...
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
            this.is404html = false
            //this.request.connection.stream.onWriteBufferEmpty = this.onWriteBufferEmpty.bind(this)

            this.setHeader('accept-ranges','bytes')
            this.setHeader('connection','keep-alive')
            if (! this.fs) {
                this.write("error: need to select a directory to serve",500)
                return
            }
            //var path = decodeURI(this.request.path)

            // strip '/' off end of path

            if (this.app.opts.optExcludeDotHtml){
                var extension = this.request.path.split('.').pop();
                if (extension == 'html') {
                    var path = this.request.path
                    var newpath = path.substring(0, path.length - 5);
                    this.setHeader('location', newpath)
                    this.writeHeaders(307)
                    this.finish()
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
                this.is404html = false
                if (entry.name == 'wsc.htaccess') {
                    this.write('<h1>403 - Forbidden</h1>', 403)
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
                if (this.request.method == "HEAD") {
                    this.responseLength = 0
                    this.writeHeaders(404)
                    this.finish()
                } else {
                    if (this.app.opts.optCustom404) {
                        this.fs.getByPath(this.app.opts.optCustom404location, (file) => {
                        if (! file.error) {
                            file.file( function(filee) {
                            var reader = new FileReader();
                            reader.onload = function(e){
                            this.is404html = true
                                var data = e.target.result
                                    if (this.app.opts.optCustom404usevar) {
                                        if (this.app.opts.optCustom404usevarvar != '') {
                                        var html = ['<script>var '+this.app.opts.optCustom404usevarvar+' = "'+this.request.path+'";</script>']
                                    } else {
                                        this.write('javascript location variable is blank', 500)
                                        return
                                    }
                                    } else {
                                    var html = ['']
                                    }
                                    html.push(data)
                                    var finaldata = html.join('\n')
                                    this.setHeader('content-type','text/html; charset=utf-8')
                                    this.write(finaldata, 404)
                                    this.finish()
                                    this.is404html = false
                        }.bind(this)
                        reader.readAsText(filee)
                        }.bind(this))
                        } else {
                        this.write('Path of 404 html was not found - 404 path is set to: '+this.app.opts.optCustom404location, 500)
                        this.finish()
                        }})
                    } else {
                    this.write('no entry',404)
                }}
            } else if (entry.error) {
                if (this.request.method == "HEAD") {
                    this.responseLength = 0
                    this.writeHeaders(404)
                    this.finish()
                } else {
                    if (this.app.opts.optCustom404) {
                        this.fs.getByPath(this.app.opts.optCustom404location, (file) => {
                        if (! file.error) {
                            file.file( function(filee) {
                            var reader = new FileReader();
                            reader.onload = function(e){
                            this.is404html = true
                                var data = e.target.result
                                    if (this.app.opts.optCustom404usevar) {
                                        if (this.app.opts.optCustom404usevarvar != '') {
                                        var html = ['<script>var '+this.app.opts.optCustom404usevarvar+' = "'+this.request.path+'";</script>']
                                    } else {
                                        this.write('javascript location variable is blank', 500)
                                        return
                                    }
                                    } else {
                                    var html = ['']
                                    }
                                    html.push(data)
                                    var finaldata = html.join('\n')
                                    this.setHeader('content-type','text/html; charset=utf-8')
                                    this.write(finaldata, 404)
                                    this.finish()
                                    this.is404html = false
                        }.bind(this)
                        reader.readAsText(filee)
                        }.bind(this))
                        } else {
                        this.write('Path of 404 html was not found - 404 path is set to: '+this.app.opts.optCustom404location, 500)
                        this.finish()
                        }})
                    } else {
                        this.write('entry not found: ' + (this.rewrite_to || this.request.path), 404)
                    }
                }
            } else if (entry.isFile) {
                this.renderFileContents(entry)
            } else {
                // directory
                var reader = entry.createReader()
                var allresults = []
                this.isDirectoryListing = true

                function onreaderr(evt) {
                    WSC.entryCache.unset(this.entry.filesystem.name + this.entry.fullPath)
                    console.error('error reading dir',evt)
                    this.request.connection.close()
                }

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
                    if (this.request.arguments && this.request.arguments.json == '1' ||
                        (this.request.headers['accept'] && this.request.headers['accept'].toLowerCase() == 'application/json')
                       ) {
                        this.renderDirectoryListingJSON(results)
                    } else if (this.app.opts.optDir404 && this.app.opts.optRenderIndex) {
                        if (this.app.opts.optCustom404) {
                            this.fs.getByPath(this.app.opts.optCustom404location, (file) => {
                            if (! file.error) {
                                file.file( function(filee) {
                                var reader = new FileReader();
                                reader.onload = function(e){
                                this.is404html = true
                                var data = e.target.result
                                    if (this.app.opts.optCustom404usevar) {
                                        if (this.app.opts.optCustom404usevarvar != '') {
                                        var html = ['<script>var '+this.app.opts.optCustom404usevarvar+' = "'+this.request.path+'";</script>']
                                    } else {
                                        this.write('javascript location variable is blank', 500)
                                        return
                                    }
                                    } else {
                                    var html = ['']
                                    }
                                    html.push(data)
                                    var finaldata = html.join('\n')
                                    this.setHeader('content-type','text/html; charset=utf-8')
                                    this.write(finaldata, 404)
                                    this.finish()
                                    this.is404html = false
                                }.bind(this)
                            reader.readAsText(filee)
                            }.bind(this))
                            } else {
                            this.write('Path of 404 html was not found - 404 path is set to: '+this.app.opts.optCustom404location, 500)
                            this.finish()
                            }})
                        } else {
                            this.write("404 - File not found", 404)
                            this.finish()
                            }
                        } else if (this.request.arguments && this.request.arguments.static == '1' ||
                        this.request.arguments.static == 'true' ||
						this.app.opts.optStatic
                       ) {
                        this.renderDirectoryListing(results)
                        } else {
                        this.renderDirectoryListingTemplate(results)
                    }
                }

                function onreadsuccess(results) {
                    //console.log('onreadsuccess',results.length)
                    if (results.length == 0) {
                        alldone.bind(this)(allresults)
                    } else {
                        allresults = allresults.concat( results )
                        reader.readEntries( onreadsuccess.bind(this),
                                            onreaderr.bind(this) )
                    }
                }

                //console.log('readentries')
                reader.readEntries( onreadsuccess.bind(this),
                                    onreaderr.bind(this))
            }
            }

        function excludedothtmlcheck() {
            if (this.app.opts.optExcludeDotHtml && this.request.path != '') {
                this.fs.getByPath(this.request.path+'.html', (file) => {
                if (! file.error) {
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
                var fullrequestpath = this.request.path
                if (entry.isDirectory) {
                    var finalpath = fullrequestpath+'/'
                } else {
                    var finapath = fullrequestpath
                    var finpath = finapath.split('/').pop();
                    var finalpath = fullrequestpath.substring(0, fullrequestpath.length - finpath.length);
                }
                if (this.request.path == '') {
                    var finalpath = '/'
                }
                var htaccesspath = finalpath+'wsc.htaccess'
                this.fs.getByPath(htaccesspath, (file) => {
                if (! file.error) {
                    file.file( function(filee) {
                        var reader = new FileReader();
                        reader.onload = function(e){
                            var dataa = e.target.result
                            var data = JSON.parse(dataa)
                            console.log(data)
                            var filerequest = this.request.path
                            var filerequested = filerequest.split('/').pop();
                            if (data.request_path == filerequested || data.request_path == 'all files') {
                                if (data.type == 301 || data.type == 302 || data.type == 307) {
                                        this.setHeader('location', data.redirto)
                                        this.writeHeaders(data.type)
                                        this.finish()
                            } else if (data.type == 401) {
                                var validAuth = false
                                var auth = this.request.headers['authorization']
                                if (auth) {
                                    if (auth.slice(0,6).toLowerCase() == 'basic ') {
                                        var userpass = atob(auth.slice(6,auth.length)).split(':')
                                        if (userpass[0] == data.username && userpass[1] == data.password) {
                                            validAuth = true
                                        }
                                    }
                                }
                                if (! validAuth) {
                                    this.setHeader("WWW-Authenticate", "Basic")
                                    this.write("<h1>401 - Unauthorized</h1>", 401)
                                    this.finish()
                                    return
                                }
                                if (validAuth) {
                                    excludedothtmlcheck.bind(this)()
                                }
                            } else {
                                excludedothtmlcheck.bind(this)()
                            }} else {
                                excludedothtmlcheck.bind(this)()
                            }
                        }.bind(this)
                        reader.readAsText(filee)
                    }.bind(this))
                } else {
                    excludedothtmlcheck.bind(this)()
                }})
            } else {
                excludedothtmlcheck.bind(this)()
            }
        },
        renderFileContents: function(entry, file) {
            getEntryFile(entry, function(file) {
                if (file instanceof DOMException) {
                    if (this.app.opts.optCustom404) {
                        this.fs.getByPath(this.app.opts.optCustom404location, (file) => {
                        if (! file.error) {
                            file.file( function(filee) {
                            var reader = new FileReader();
                            reader.onload = function(e){
                            this.is404html = true
                                var data = e.target.result
                                    if (this.app.opts.optCustom404usevar) {
                                        if (this.app.opts.optCustom404usevarvar != '') {
                                        var html = ['<script>var '+this.app.opts.optCustom404usevarvar+' = "'+this.request.path+'";</script>']
                                    } else {
                                        this.write('javascript location variable is blank', 500)
                                        return
                                    }
                                    } else {
                                    var html = ['']
                                    }
                                    html.push(data)
                                    var finaldata = html.join('\n')
                                    this.setHeader('content-type','text/html; charset=utf-8')
                                    this.write(finaldata, 404)
                                    this.finish()
                                    this.is404html = false
                        }.bind(this)
                        reader.readAsText(filee)
                        }.bind(this))
                        } else {
                        this.write('Path of 404 html was not found - 404 path is set to: '+this.app.opts.optCustom404location, 500)
                        this.finish()
                        }})
                    } else {
                    this.write("File not found", 404)
                    this.finish()
                    return
                }}
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

            this.setHeader('transfer-encoding','chunked')
            this.writeHeaders(200)
            this.writeChunk(WSC.template_data )
                if (this.request.path != '') {
                    var html = ['<script>start("'+this.request.path+'")</script>']
                    html.push('<script>onHasParentDirectory();</script>')
                    } else {
                    var html = ['<script>start("/")</script>']
                    }
            for (var i=0; i<results.length; i++) {
                var rawname = '"'+results[i].name+'"'
                var name = '"'+encodeURIComponent(results[i].name)+'"'
                var isdirectory = results[i].isDirectory
                var filesize = '""'
                //var modified = '4/27/121, 10:38:40 AM'
                var modified = '""'
		        var filesizestr = '""'
		        var modifiedstr = '""'
                // raw, urlencoded, isdirectory, size, size as string, date modified, date modified as string
                if (rawname != '"wsc.htaccess"') {
                html.push('<script>addRow('+rawname+','+name+','+isdirectory+','+filesize+','+filesizestr+','+modified+','+modifiedstr+');</script>')
            }}
            var data = html.join('\n')
            data = new TextEncoder('utf-8').encode(data).buffer
            this.writeChunk(data)
            this.request.connection.write(WSC.str2ab('0\r\n\r\n'))
            this.finish()
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

        }
    }, WSC.BaseHandler.prototype)

    if (chrome.runtime.id == WSC.store_id || true) {
        
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
                        fr.readAsArrayBuffer(file)
                    }
                    e.file( onfile, onfile )
                }
            }
            pentry.getFile(template_filename,{create:false},onfile,onfile)
        })
    }

    WSC.DirectoryEntryHandler = DirectoryEntryHandler

})();
