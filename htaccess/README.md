
<h1>How to use wsc.htaccess</h1>
<br>
<p>Why not just .htaccess?</p>
<p>Chrome os does not allow you to name a file starting with a dot. This allows chrome os users to use this feature!</p>
<p>Also, Web Server for Chrome DOES NOT have support for .htaccess files. Instead, we have wsc.htaccess files, which gets the same thing done (Not all features implimented).</p>
<br><br>
<h1>How to</h1>
<h2>Currently supported</h2>
<p>301 - Moved Permanently. Tells the server that when chosen file is requested to move to a different directory or file. The browser will cache this</p>
<p>302 - Found. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser</p>
<p>307 - Temporary Redirect. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser.</p>
<p>401 - Unauthorized. The page will require login. For some reason, I cannot find how to clear the cache of the authorization header, which means that once you type it in, the browser will not ask for a login, unless you have multiple password protected pages with different passwords, The authentication header will change whenever you enter a different password.</p>
<p>403 - Forbidden. This will deny direct access to image/video/audio files. This option only works if https is enabled or if the user is on a localhost address.</p>
<p>Render Directory Listing - Ignores the value of 404 instead of directory listing and renders the directory listing</p>
<p>If you want more features - Make an issue!</p>
<br>
<h1>Extra Features</h1>
<p>You can now control the amount of access the user has.</p>
<p>You can now allow/deny the user the option to view (GET request) wsc.htaccess files</p>
<p>You can now allow/deny uploading (PUT request) wsc.htaccess files (Helpful for when making something like a file hosting, the only question with doing that is why are you using a web server as simple as this)</p>
<p>You can now allow/deny deleting (DELETE request) wsc.htaccess files (Why you would enable this - I dont know)</p>
<p>FOR MAXIMUM SECURITY - IT IS RECOMMENDED TO LEAVE THESE ALL TURNED OFF!!</p>
<p>Custom 400 (Bad Request) page not supported</p>
<h1>Making the file</h1>
<p>A wsc.htaccess file is actually a javascript array, which means one problem with the file will cause it not to work - So be careful. No additional info can be put into the file</p>
<p>Note - If you are trying to redirect to some index.html file and you have the option to automatically show index.html turned on, your path will go from '/somepath/index.html' to '/somepath/'</p>
<p>Note - If you are trying to redirect to some .html file and you have the option to remove .html extension turned on, leave the .html extension. The web server will handle the request and forward it to have no .html extension</p>

Note - when selecting the file to scan for, if the file is index.html and the file is `index.html` or `index.htm`, leave the path blank. It should look like this:  `"request_path": "",`. The web server will take care of the rest

Note - There are security measures that when request_path = "" It will deny access to index.html, index (For no .html extension) and index.htm. Use `"request_path": "",`. if the file is index.html or index.htm - This will protect every way of access.

Note - when selecting the file to scan, if the file is some .html and you have the option to remove the .html extension turned on, leave the .html extension. The Web Server is programed to handle the request!

Note - To set more than 1 ruleset per file, see instruction at bottom of the page

Note - 401 (unauthorized) username and passwords are CASE SENSITIVE!!
<p>Note - wsc.htaccess file MUST be in the same directory as the file you want to change. The file does need to exist, due to the way the web server works.</p>
<p>IMPORTANT NOTE - EVERYTHING IN THE FILE (AND THE FILE NAME) IS CASE SENSITIVE!!</p>
<br>
<h2>301 Example</h2>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 301, 
        "redirto": "/path/you/want/to/redirect/to"
    }
]
```
<br>
<h2>302 Example</h2>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 302, 
        "redirto": "/path/you/want/to/redirect/to"
    }
]
```
<br>
<h2>307 Example</h2>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 307, 
        "redirto": "/path/you/want/to/redirect/to"
    }
]
```
<br>
<h2>401 Example</h2>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 401,
        "username": "test",
        "password": "example"
    }
]
```
<br>
<h2>403 Example</h2>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 403
    }
]
```
<br>
<h2>Directory Listing</h2>

```
[
    {
        "type": "directory listing"
    }
]
```
<br>
<h1>How to use more than 1 ruleset per file</h1>
<p>Pay VERY close attention to the syntax. One thing wrong will cause an error!!</p>
<p>First, I provide an example</p>

```
[
    {
        "request_path": "oranges.html",
        "type": 401,
        "username": "Username",
        "password": "Password"
    },
    {
        "type": "directory listing"
    }
]
```

You basically have `[` and `]` surrounding the entire file and each ruleset inside `{` these `}`
You MUST separate each ruleset with a comma (As shown in the example). The failure to do so will result in an error.
For the last ruleset, no comma can be after the `}`. This will break the array and give you an error.
Currently, each file can only have 1 ruleset.
