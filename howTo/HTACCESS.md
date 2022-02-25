
<h1>How to use wsc.htaccess</h1>
<br>
<p>Why not just .htaccess?</p>
<p>Chrome os does not allow you to name a file starting with a dot. This allows chrome os users to use this feature!</p>
<p>Also, Web Server for Chrome DOES NOT have support for .htaccess files. Instead, we have wsc.htaccess files, which gets the same thing done (Not all features implimented).</p>
<br><br>
<h1>How to</h1>
<p>All Htaccess features are built to have 100% compatibility with changes in settings</p>
<h2>Currently supported</h2>
<p>301 - Moved Permanently. Tells the server that when chosen file is requested to move to a different directory or file. The browser will cache this</p>
<p>302 - Found. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser</p>
<p>307 - Temporary Redirect. Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser.</p>
<p>401 - Unauthorized. The page will require login. For some reason, I cannot find how to clear the cache of the authorization header, which means that once you type it in, the browser will not ask for a login, unless you have multiple password protected pages with different passwords, The authentication header will change whenever you enter a different password.</p>
<p>403 - blocks any request to the file</p>
<p>denyDirectAccess - This will deny direct access to image/video/audio files. This option only works if https is enabled or if the user is on a localhost address.</p>
<p>Render Directory Listing - Ignores the value of 404 instead of directory listing and renders the directory listing</p>
<p>Deny deleting for a specific file or directory - Ignores value of delete option and will deny delete to requested file</p>
<p>Allow deleting for certian file - Ignores value of delete option and will allow deleting requested file</p>
<p>Deny uploading for a specific file or directory - Ignores value of PUT option and will deny put to requested file</p>
<p>Allow uploading for certian file - Ignores value of PUT option and will allow deleting requested file.</p>
<p>send directory contents - Will send the current directory at the end of the file. See the How To for a more advanced description</p>
<p>additional header - Will set an additional header</p>
<p>Versioning - relative file hosting</p>
<p>serverSideJavaScript - Just what it sounds like</p>
<p>If you want more features - Make an issue!</p>
<br>
<h1>Extra Features</h1>
<p>You can now control the amount of access the user has.</p>
<p>You can now allow/deny the user the option to view (GET request) wsc.htaccess files</p>
<p>You can now allow/deny uploading (PUT request) wsc.htaccess files (Helpful for when making something like a file hosting, the only question with doing that is why are you using a web server as simple as this)</p>
<p>You can now allow/deny deleting (DELETE request) wsc.htaccess files (Why you would enable this - I dont know)</p>
<p>FOR MAXIMUM SECURITY - IT IS RECOMMENDED TO LEAVE THESE ALL TURNED OFF!!</p>
<h1>Making the file</h1>
<p>A wsc.htaccess file is actually a javascript array, which means one problem with the file will cause it not to work - So be careful. No additional info can be put into the file</p>
<p>Note - If you are trying to redirect to some index.html file and you have the option to automatically show index.html turned on, your path will go from '/somepath/index.html' to '/somepath/'</p>
<p>Note - If you are trying to redirect to some .html file and you have the option to remove .html extension turned on, leave the .html extension. The web server will handle the request and forward it to have no .html extension</p>

Note - when selecting the file to scan for, if you are trying to edit some index.html (or index.htm, or index.xhtml, or index.xhtm) Put the file name in place of request path. example: `"request_path": "index.html",`. Security will scan any way to get the the file

Note - when selecting the file to scan, if the file is some .html and you have the option to remove the .html extension turned on, leave the .html extension. The Web Server is programed to handle the request!

Note - To set more than 1 ruleset per file, see instruction at bottom of the page

Note - 401 (unauthorized) username and passwords are CASE SENSITIVE!!
<p>Note - wsc.htaccess file MUST be in the same directory as the file you want to change. The file does not need to exist (Mainly for 301, 302, and 307).</p>
<p>IMPORTANT NOTE - EVERYTHING IN THE FILE (AND THE FILE NAME) IS CASE SENSITIVE!!</p>
<br>

To use option for all files, the value of request path will be 'all files' It should look like this `"request_path": "all files",`

<br>
<h2>301 Example</h2>
<p>Tells the server that when chosen file is requested to move to a different directory or file. The browser will cache this</p>

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
<p>Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser</p>

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
<p>Tells the server that when chosen file is requested to move to a different directory or file. Not cached by the browser.</p>

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
<p>The page will require login.</p>

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
<h2>denyDirectAccess Example</h2>
<p>This will deny direct access to image/video/audio files. This option only works if https is enabled or if the user is on a localhost address.</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "denyDirectAccess"
    }
]
```
<br>
<h2>Directory Listing</h2>
<p>Ignores the value of 404 instead of directory listing and renders the directory listing</p>

```
[
    {
        "type": "directory listing"
    }
]
```
<br>
<h2>Deny uploading</h2>
<p>Ignores value of PUT option and will deny put to requested file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "deny put"
    }
]
```
<br>
<h2>Deny delete</h2>
<p>Ignores value of delete option and will deny delete to requested file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "deny delete"
    }
]
```
<br>
<h2>Allow Uploading</h2>
<p>Ignores value of PUT option and will allow deleting requested file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "allow put"
    }
]
```
<br>
<h2>Allow delete</h2>
<p>Ignores value of delete option and will allow deleting requested file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "allow delete"
    }
]
```
<br>
<h2>403 - Block File</h2>
<p>Just blocks the file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": 403
    }
]
```
<br>
<h2>Versioning</h2>
<p>Versions of a file</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "versioning",
        "default": 4,
        "variable": "v",
        "version_data": {"1": "Path to file",
                         "2": "Path to file",
                         "3": "Path to file",
                         "4": "Path to file"
                        }
    }
]
```
<p>Example of request path</p>

```
{
    "1": "/data/path/to/file/index.html"
}
```
or, if the you were in the `/data/asd/` directory

```
{
    "1": "../path/to/file/index.html"
}
```
<p>You can add as many versions as you would like.</p>
<p>I have recently made it to where you can use relative paths!</p>
<p>Versioning pretty much just makes the server think that you requested another file. So you can do a directory or whatever! The file will be checked with the htaccess of that current directory</p>

The variable is what the user needs to request. If we use v, the user would request something like `localhost:8887/example.mp4?v=1`
<p>Note that you do not need an extension for the requested file.</p>
<br>
<h2>additional header</h2>
<p>Sends an additional header</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "additional header",
        "headerType": "the type of header",
        "headerValue": "the value of the header"
    }
]
```
<p>If you go to a site (Like <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers">Mozilla</a>) it will show the header as</p>

`Cookie: name=value`. The first part of the header (In this case, `Cookie`) will be the `headerType` and the second part of the header (In this case, `name=value`) will be the `headerValue`.
The end result will be
```
[
    {
        "request_path": "name of file you want to modify",
        "type": "additional header",
        "headerType": "Cookie",
        "headerValue": "name=value"
    }
]
```

<br>
<h2>send directory contents</h2>
<p>Will send the current directory along with the file</p>
<p>Example:</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "send directory contents",
        "dir_to_send": "../somepath/"
    }
]
```
<p>More howto (send directory contents)</p>

This feature CANNOT use the `all files` value for the `request_path` field. You must specify each file separately
<p>if dir_to_send is not specified, then the current directory will be sent</p>
<p>Getting info from sent contents</p>
<p>This is what is sent</p>

```
<script>addRow("index.html", "index.html", false, 6276, "6.1 KiB", 302113940, "5/25/21, 1:09:40 PM")</script>
```
<p>It will send as an addRow function. The contents are, as follows.</p>

`addRow(filename, filenameencoded, isdirectory, size, sizestr, date, datestr)`


`filename`: The raw file name.
`filenameencoded`: The encoded file name (For things like setting link locations)
`isdirectory`: If the sent row is a directory, this will be true. Will send as `true` or `false`
`size`: File size (in Bytes) Example: `254014`
`sizestr`: File size (As a string) Example: `248.1 KiB`
`date`: Date not in a string format. Example: `142132146`
`datestr`: Date as a string. Example: `3/11/21, 3:21:46 AM`
<br>
<h2>serverSideJavaScript</h2>
<p>Allows you to process and respond as you wish</p>
<p>Example:</p>

```
[
    {
        "request_path": "name of file you want to modify",
        "type": "serverSideJavaScript",
        "key": "ATonOfRaNdOmNumbersAndLetters"
    }
]
```
<p>Please refer to the <a href='post.md'>Post Handler</a> To learn how to respond.</p>

The only difference is - DO NOT declare the type as postKey in the htaccess file and instead of using `postKey = 'wa4e76yhefy54t4a'` use `SSJSKey = 'wa4e76yhefy54t4a'`

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
    },
    {
        "request_path": "all files",
        "type": "deny delete"
    }
]
```

You basically have `[` and `]` surrounding the entire file and each ruleset inside `{` these `}`
You MUST separate each ruleset with a comma (As shown in the example). The failure to do so will result in an error.
For the last ruleset, no comma can be after the `}`. This will break the array and give you an error.

When using multiple rulesets per file, the server will first check if an authentication rule is in place. If it is, the server will require the user to enter the password before it will allow the user to do anything. After the user has correct auth (if the auth is present) it will check for rulesets from the top of the file, to the bottom. The redirects, the directory listing, and sending the current directory with the file cannot both be used, whatever the web server picks up first is what will be executed.

You can have as many additional headers as you like!



