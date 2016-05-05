import tornado.ioloop
import tornado.websocket


class H(tornado.websocket.WebSocketHandler):
    def open(self):
        print 'opened'
    def on_message(self, msg):
        print 'onmessage',msg
    def on_close(self):
        print 'closed'
    def check_origin(self,origin): return True
import tornado.httpserver

import tornado.web
app = tornado.web.Application([
    ('.*',H)
])
server = tornado.httpserver.HTTPServer(app)
server.listen(8080)
tornado.ioloop.IOLoop.instance().start()
