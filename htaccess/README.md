
<h1>How to use wsc.htaccess</h1>
<br>
<p>Why not just .htaccess?</p>
<p>Chrome os does not allow you to name a file starting with a dot. This allows chrome os users to use this feature!</p>
<p>Also, Web Server for Chrome DOES NOT have support for .htaccess files. Instead, we have wsc.htaccess files, which gets the same thing done (Not all features implimented).
<br><br>
<h1>How to</h1>
<h2>Currently supported</h2>
<p>301 - Moved Permanently. Tells the server that when chosen file is requested to move to a different directory or file. The browser will cache this</p>
<p>302 - Found. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser</p>
<p>307 - Temporary Redirect. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser.</p>
<p>If you want more features - Make an issue!</p>
<br>
<h2>Planned features (Doesnt mean it will happen)</h2>
<p>401 - Unauthorized</p>
<p>undetermined - requires Authentication</p>
<br>
<h1>Making the file</h1>
<p>A wsc.htaccess file is actually a json string, which means one problem with the file will cause it not to work - So be careful. No additional info can be put into the file</p>
<p>Note - If you are trying to redirect to some index.html file and you have the option to automatically show index.html turned on, your path will go from '/somepath/index.html' to '/somepath/'</p>
<p>Note - If you are trying to redirect to some .html file and you have the option to remove .html extension turned on, your path will go from '/somepath/blah.html' to '/somepath/blah'</p>

Note - when selecting the file to scan, if the file is index.html and you have the option to automatically show index.html turned on, leave the path blank. It should look like this:  `"request_path": "",`

Note - when selecting the file to scan, if the file is some .html and you have the option to remove the .html extension turned on, remove the .html from the file. It should go from:  `"request_path": "somehtml.html",` to: `"request_path": "somehtml",`

<p>Note - Currently, Only ONE ruleset can be set in a directory which means only 1 file per directory can use these features. Plan for this to change.</p>
<p>Note - wsc.htaccess file MUST be in the same directory as the file you want to change. The file does not need to exist, as it overrides rendering the file</p>
<br>
<h2>301 Example</h2>

```
{
    "request_path": "name of file you want to modify the destination of",
    "type": 301, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
<br>
<h2>302 Example</h2>

```
{
    "request_path": "name of file you want to modify the destination of",
    "type": 302, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
<br>
<h2>307 Example</h2>

```
{
    "request_path": "name of file you want to modify the destination of",
    "type": 307, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
