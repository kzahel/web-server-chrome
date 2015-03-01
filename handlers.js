(function(){

    function getEntryFile( entry, callback ) {

        var cacheKey = entry.filesystem.name + '/' + entry.fullPath
        var inCache = entryFileCache.get(cacheKey)
        if (inCache) { 
            //console.log('file cache hit'); 
            callback(inCache); return }
        
        entry.file( function(file) {
            entryFileCache.set(cacheKey, file)
            callback(file)
        }, function(evt) {
            console.error('entry.file() error',evt)
            debugger
        })
    }

    function DirectoryEntryHandler(request) {
        BaseHandler.prototype.constructor.call(this)
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
        get: function() {
            //this.request.connection.stream.onWriteBufferEmpty = this.onWriteBufferEmpty.bind(this)

            this.setHeader('accept-ranges','bytes')
            this.setHeader('connection','keep-alive')
            if (! window.fs) {
                this.write("error: need to select a directory to serve",500)
                return
            }
            //var path = decodeURI(this.request.path)

            // strip '/' off end of path

            fs.getByPath(this.request.path, this.onEntry.bind(this))
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
                    this.write('no entry',404)
                }
            } else if (entry.error) {
                if (this.request.method == "HEAD") {
                    this.responseLength = 0
                    this.writeHeaders(404)
                    this.finish()
                } else {
                    this.write('entry not found',404)
                }
            } else if (entry.isFile) {
                getEntryFile(entry, function(file) {
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
                            console.log('large file, streaming mode!')
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
            } else {
                // directory
                var reader = entry.createReader()
                var allresults = []
                this.isDirectoryListing = true

                function onreaderr(evt) {
                    entryCache.unset(this.entry.filesystem.name + this.entry.fullPath)
                    console.error('error reading dir',evt)
                    this.request.connection.close()
                }

                function alldone(results) {
                    this.renderDirectoryListing(results)
                }

                function onreadsuccess(results) {
                    console.log('onreadsuccess',results.length)
                    if (results.length == 0) {
                        alldone.bind(this)(allresults)
                    } else {
                        allresults = allresults.concat( results )
                        reader.readEntries( onreadsuccess.bind(this),
                                            onreaderr.bind(this) )
                    }
                }

                console.log('readentries')
                reader.readEntries( onreadsuccess.bind(this),
                                    onreaderr.bind(this))
            }
        },
        renderDirectoryListing: function(results) {
            var html = ['<html>']
            html.push('<style>li.directory {background:#aab}</style>')
            html.push('<a href="..">parent</a>')
            html.push('<ul>')

            for (var i=0; i<results.length; i++) {
                var name = _.escape(results[i].name)
                if (results[i].isDirectory) {
                    html.push('<li class="directory"><a href="' + name + '/">' + name + '</a></li>')
                } else {
                    html.push('<li><a href="' + name + '">' + name + '</a></li>')
                }
            }
            html.push('</ul></html>')
            this.setHeader('content-type','text/html')
            this.setHeader('test-foo-bar','999')
            this.write(html.join('\n'))
        },
        onReadEntry: function(evt) {
            if (evt.type == 'error') {
                console.error('error reading',evt.target.error)
                // clear this file from cache...
                entryFileCache.unset( this.entry.filesystem.name + '/' + this.entry.fullPath )

                this.request.connection.close()
            } else {
            // set mime types etc?
                this.write(evt.target.result)
            }

        }
    }, BaseHandler.prototype)



    window.DirectoryEntryHandler = DirectoryEntryHandler

})()