Chrome Web Server - an HTTP web server for Chrome (chrome.socket)

https://chrome.google.com/webstore/detail/ofhbbkphhbklhfoeikjpcbhemlocgigb

The default behavior right now is very simple. You choose a directory
to serve static content. It will crash if you try and request a file
that is too large, because it does not stream the response, rather
loads it all into memory.

====

I wrote this because the example app provided by google would lock and
hang and had all sorts of nasty race conditions.

The design of this is inspired heavily by to the Python Tornado Web
library. In this as well as that, you create an "app" which registers
handlers. Then under the hood it will accept connections, create an
HTTPConnection object, and that has an associated IOStream object
which handles the nonblocking read/write events for you.

