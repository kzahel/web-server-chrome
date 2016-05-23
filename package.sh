rm package.zip

#zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x images/cws_*.png -x *.scratch -x polymer-ui/node-modules/**\* -x wsc-chrome.min.js

zip package.zip manifest.json *.js *.html images/200*.png polymer-ui/*.html polymer-ui/*.js polymer-ui/*.css polymer-ui/bower_components/font-roboto/fonts/roboto/Roboto-Bold.ttf -x wsc-chrome.min.js
