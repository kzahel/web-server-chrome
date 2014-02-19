Chrome Web Server - an HTTP web server for Chrome (chrome.socket)

https://chrome.google.com/webstore/detail/ofhbbkphhbklhfoeikjpcbhemlocgigb

====

I wrote this because the example app provided by google would lock and
hang and had all sorts of nasty race conditions.

The design of this is inspired heavily by to the Python Tornado Web
library. In this as well as that, you create an "app" which registers
handlers. Then under the hood it will accept connections, create an
HTTPConnection object, and that has an associated IOStream object
which handles the nonblocking read/write events for you.

