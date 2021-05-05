
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
<br>
<h2>Planned features (Doesnt mean it will happen)</h2>
<p>401 - Unauthorized</p>
<p>undetermined - requires Authentication</p>
<br>
<h1>Making the file</h1>
<p>A wsc.htaccess file is actually a json string, which means one problem with the file will cause it not to work - So be careful. No additional info can be put into the file</p>
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
