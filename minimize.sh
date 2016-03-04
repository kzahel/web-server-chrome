
if [ -f wsc-chrome.min.js ]; then
    rm wsc-chrome.min.js
fi

for f in "underscore.js" "encoding.js" "common.js" "mime.js" "buffer.js" "request.js" "stream.js" "chromesocketxhr.js" "connection.js" "webapp.js" "handlers.js" "httplib.js"; do cat $f >> wsc-chrome.min.js; done


    
    
