Chrome Web Server - an HTTP web server for Chrome (chrome.socket)

Get it in the chrome web store:
https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb

Here is an example project based on it:
https://chrome.google.com/webstore/detail/flv-player/dhogabmliblgpadclikpkjfnnipeebjm

The default behavior right now is very simple. You choose a directory
to serve static content. It is now able to stream large files and
handle range requests. It also sets mime types correctly.

====

MIT license

I wrote this because the example app provided by google would lock and
hang and had all sorts of nasty race conditions.

The design of this is inspired heavily by to the Python Tornado Web
library. In this as well as that, you create an "app" which registers
handlers. Then under the hood it will accept connections, create an
HTTPConnection object, and that has an associated IOStream object
which handles the nonblocking read/write events for you.


