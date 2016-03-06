rm package.zip

zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x images/cws_*.png -x *.scratch -x polymer-ui/node-modules/**\* -x wsc-chrome.min.js


