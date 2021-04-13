<a target="_blank" href="https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb">![Try it now in CWS](https://raw.githubusercontent.com/kzahel/web-server-chrome/master/images/200ok-128.png "Click here to install this sample from the Chrome Web Store")</a>

## Web Server for Chrome

an HTTP web server for Chrome (chrome.sockets)

Get it in the chrome web store:
https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb

Many people have found the webstore version useful for doing some basic web development as an alternative to python -m SimpleHTTPServer. But it can also be used for quick file sharing over a local network.

Features
- serve local files
- configure listening port
- configure listening interface (e.g. localhost or all interfaces)
- custom http handlers possible
- websocket support available
- works nice with chrome.runtime.onSuspend
- options for autostart, start in background, etc etc.
- handles range requests, HEAD, etc
- options for CORS
- optional PUT, DELETE request (for upload files)
- sets MIME types
- can render directory listing
- See relevant options: https://github.com/kzahel/web-server-chrome/blob/master/polymer-ui/options.js


How to include into your own chrome app
===

run minimize.sh to concatenate all the required files together and then include the resulting wsc-chrome.min.js in your project. Here is an example of another project's usage: https://github.com/zebradog/kiosk/blob/f7a398f697edc1c22b90c14f959779f1e850012a/src/js/main.js#L124

### Basic usage:

```
var app = new WSC.WebApplication(options)
app.start( callback )
```

options: object, with keys
- handlers: array of handlers,
- renderIndex: boolean (whether to render index.html if in directory)
- optBackground: whether to run even if the window is closed
- optAutoStart: whether to auto start when chrome starts
- port: int (port to listen on)
- See relevant options: https://github.com/kzahel/web-server-chrome/blob/master/polymer-ui/options.js

```
Handlers
    var handlers = [
        ['/favicon.ico',FavIconHandler],
        ['/stream.*',StreamHandler],
        ['/static/(.*)',StaticHandler],
        ['.*', DefaultHandler]
    ]
```

handlers is an array of 2 element arrays where the first item is a regular expression for the URL and the second is the handler class, which should extend WSC.BaseHandler

```
    function StaticHandler() {
        this.disk = null
        chrome.runtime.getPackageDirectoryEntry( function(entry) { this.disk = entry }.bind(this) )
        WSC.BaseHandler.prototype.constructor.call(this)
    }
    var FavIconHandlerprototype = {
        get: function(path) {
            // USE HTML5 filesystem operations to read file
            
        },
        onReadFile: function(evt) {
            if (evt.error) {
                this.write('disk access error')
            } else {
                this.write(evt)
            }
        }
    }
    _.extend(StaticHandler.prototype,
             StaticHandlerprototype,
             WSC.BaseHandler.prototype
            )
```



### Building

```
cd web-server-chrome
mkdir assets
cd makedeps
npm install
npm run make # this builds the app dependencies such as react and material-ui into a bundle
cd ../react-ui
npm run watch # Press ctrl-c if you just want to build it once.
# press ctrl-C if you are done editing
cd ../
bash package.sh
```

This creates package.zip, which can then be distributed.


### Where to get it

Get it in the chrome web store:
https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb

The default behavior right now is very simple. You choose a directory
to serve static content. It is now able to stream large files and
handle range requests. It also sets mime types correctly.

Here is an example project based on it:
https://chrome.google.com/webstore/detail/flv-player/dhogabmliblgpadclikpkjfnnipeebjm

---

MIT license

I wrote this because the example app provided by google would lock and
hang and had all sorts of nasty race conditions. Plus it would not
stream large files or do range requests, HEAD requests, etc, etc.

The design of this is inspired heavily by to the Python Tornado Web
library. In this as well as that, you create an "app" which registers
handlers. Then under the hood it will accept connections, create an
HTTPConnection object, and that has an associated IOStream object
which handles the nonblocking read/write events for you.


See CREDITS file
