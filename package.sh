rm package.zip

#zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x images/cws_*.png -x *.scratch -x polymer-ui/node-modules/**\* -x wsc-chrome.min.js

zip package.zip manifest.json *.js *.html images/200*.png -r polymer-ui -x wsc-chrome.min.js
