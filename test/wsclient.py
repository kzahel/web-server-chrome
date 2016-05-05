from tornado.websocket import websocket_connect
from tornado import gen
import json
import sys
port = sys.argv[1]
print 'connect to port',port
@gen.coroutine
def go():
    print 'connect to ws'
    conn = yield websocket_connect('ws://127.0.0.1:%s/' % port)
    conn.write_message('\0'*8000,True)
    #conn = yield websocket_connect('ws://127.0.0.1:%s/' % port)
    while True:
        msg = yield conn.read_message()
        if msg is None:
            print 'msg none',[msg]
            import sys; sys.exit(0)
            break
        else:
            print 'got a message',[msg]

            try:
                j = json.loads(msg)
                print 'json msg',j

                conn.write_message(j['c']*j['n'],j['b'])
                    
                continue
            except Exception,e:
                print e
            
            if msg == 'ping':
                conn.write_message('pong')
            if msg == '8000':
                conn.write_message('\0'*8000,True)
            elif msg == 'binaryping':
                conn.write_message('binarypong',True)

import tornado.ioloop
go()
tornado.ioloop.IOLoop.instance().start()
