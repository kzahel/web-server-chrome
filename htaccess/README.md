
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
<p>401 - Unauthorized. The page will require login. For some reason, I cannot find how to clear the cache of the authorization header, which means that once you type it in, the browser will not ask for a login, unless you have multiple password protected pages with different passwords, The authentication header will change whenever you enter a different password.</p>
<p>If you want more features - Make an issue!</p>
<br>
<h1>Making the file</h1>
<p>A wsc.htaccess file is actually a json string, which means one problem with the file will cause it not to work - So be careful. No additional info can be put into the file</p>
<p>Note - If you are trying to redirect to some index.html file and you have the option to automatically show index.html turned on, your path will go from '/somepath/index.html' to '/somepath/'</p>
<p>Note - If you are trying to redirect to some .html file and you have the option to remove .html extension turned on put the .html extension. The web server will handle the request and forward it to have no .html extension</p>

Note - when selecting the file to scan, if the file is index.html and you have the option to automatically show index.html turned on, leave the path blank. It should look like this:  `"request_path": "",`.

Note - There are security measures that when request_path = "" It will deny access to index.html, index (For no .html extension) and index.htm. Use `"request_path": "",`. if the file is index.html or index.htm - This will protect every way of access.

Note - when selecting the file to scan, if the file is some .html and you have the option to remove the .html extension turned on, remove the .html from the file. It should go from:  `"request_path": "somehtml.html",` to: `"request_path": "somehtml",` - Plan for this to change 

Note - Currently, Only ONE ruleset can be set per directory, you can set all of the files or one of the files to obey this. To protect / redirect all files in a directory, change the value of `"request_path"` to `"all files"` to make `"request_path": "all files",`. Do not expect this to change. It would be overly complicated (and make the performance extremely low) to use arrays and to find which one is what and I'ts just not going to happen.

<p>Note - wsc.htaccess file MUST be in the same directory as the file you want to change. The file does not need to exist, as it overrides rendering the file</p>
<p>IMPORTANT NOTE - EVERYTHING IN THE FILE (AND THE FILE NAME) IS CASE SENSITIVE!!</p>
<br>
<h2>301 Example</h2>

```
{
    "request_path": "name of file you want to modify",
    "type": 301, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
<br>
<h2>302 Example</h2>

```
{
    "request_path": "name of file you want to modify",
    "type": 302, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
<br>
<h2>307 Example</h2>

```
{
    "request_path": "name of file you want to modify",
    "type": 307, 
    "redirto": "/path/you/want/to/redirect/to"
}
```
<br>
<h2>401 Example</h2>

```
{
    "request_path": "name of file you want to modify",
    "type": 401,
    "username": "test",
    "password": "example"
}
```
