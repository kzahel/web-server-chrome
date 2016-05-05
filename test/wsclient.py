from tornado.websocket import websocket_connect
from tornado import gen
import sys
port = sys.argv[1]
print 'connect to port',port
@gen.coroutine
def go():
    print 'connect to ws'
    conn = yield websocket_connect('ws://127.0.0.1:%s/' % port)
    conn.write_message("hello")
    #conn = yield websocket_connect('ws://127.0.0.1:%s/' % port)
    while True:
        msg = yield conn.read_message()
        if msg is None:
            break
        else:
            print 'got a message'

import tornado.ioloop
go()
tornado.ioloop.IOLoop.instance().start()
