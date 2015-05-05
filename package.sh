rm package.zip

zip package.zip -r * -x package.sh -x *.git* -x "*.*~" -x cws_*.png -x *.scratch

