
<h1>How to use Server Side POST</h1>
<br>
<h2>How it works</h2>
<br>
<p>Perform a post request towards a js file, This js file will be checked for a key (Security) and with the correct key, the document will temporarily append the script and will execute the requested script</h2>
<br>
<p>As a security feature, you must have the request path and a key programed in a wsc.htaccess file and in the js file.</p>
<p>The file name does not need to end with .js  The extension can be anything you want as the extension does not matter and will not be checked</p>
<p>You do not need to have htaccess enabled, this does not enable htaccess. It is just easier to keep everything in 1 place</p>
<p>It is recommended to have the log to file function on, so it is easier to see if something goes wrong</p>
<p>WHILE IT IS NOT REQUIRED - IT IS VERY HIGHLY RECOMENDED TO TURN ON THE HTACCESS FEATURE - AS IT WILL BLOCK USERS FROM PERFORMING A GET REQUEST TOWARDS THE FILE</p>
<br><br>
<h2>Writing the htaccess file</h2>
<p>The file needs to be in the same path as the requested file</p>
<p>The file name should be wsc.htaccess (case sensitive)</p>
<p>Example:</p>

```
[
    {
        "type": "POSTkey",
        "request_path": "index.js",
        "key": "wa4e76yhefy54t4a"
    }
]
```
Change `request_path` to the file you would like to perform this towards
Change `key` to a random string of numbers and letters
Do not change `type`
Access to the file (through a GET request) is automaticaly blocked

<h2>Adding key verification to the .js file</h2>
<p>Add the following line to your htaccess file</p>

```
postKey = 'wa4e76yhefy54t4a'
```
Change `wa4e76yhefy54t4a` to the value of the key that you had inputed into the htaccess file
The start of the line (`postKey = `) MUST STAY THE SAME (case sensitive). The server does not check for a set variable, but it will scan the file for the text `postKey`
THIS LINE MUST BE ITS OWN LINE!! You CANNOT combine multiple lines of code with `;`
Indenting this line may cause for the server to not find this line and in result, the code will not be executed

the res and req variables ARE NOT WINDOW VARIABLES. DO NOT USE THEM AS SUCH

<br>
<h2>Writing the code inside the file</h2>

Example:
```
res.contentType('text/plain') // ALWAYS set the headers first
res.write('test') // THEN send the data
res.end() // THEN end the request
```
res contains all the functions to respond, while req contains all the request information

*NOTE* - You can use BOTH server side javascript and Server Side POST in the same file! Just declare 2 seperate keys in the htaccess and in the file!

IMPORTANT INFORMATION - When writing the file, DO NOT surround the file in a function as you would normally do
Do not do:
```
(function() {
awefioeeai.somecode()

})();
```
If you need to use browserify on your file, just remove the `(function() {` at the beggining and the `})();` at the end.

DO NOT WORRY. This is to prevent problems with the res and req variables. Your script will be excecuted inside a function, so all return statements will work correctly


<h1>res Commands</h1>

`res.end()`: function
This function MUST be called at the end of the file. If called before finished processing, the server will cut off your script
This function will close the http request
You can use this function directly when finished and it will automaticaly respond with an http code of 200 (unless set otherwise)

`res.write(string, httpCode)`: function
This function will write data to the client. Once called, you canot push any more information.

`res.setHeader(headerType, headerValue)`: function
This function will set headers of the response.
Instead of `Cookie: name=value`, you would put `res.setHeader('Cookie', 'name=value')`

`res.getFile(path, callback)`: function
This function will read a file. Relative urls are supported.
If the requested path is a directory, the callback function will be called with a listing of all the files in a directory.
To call the file use the `file.file()` function
Example: 
```
`res.getFile('../test.txt', function(file) {
    if (file.error) {
        console.log('error')
    } else if (file.isFile) {
        file.file(function(file) { // you must use the file.file() function to call the file.
            
            //if the file is a file, you can read and do whatever. You will need to use a FileReader to read the file.
        })
    } else if (file.isDirectory) {
        // This will return an array of all of the files in the directory. To use a file you must use file.file() as shown below
        file[2].file(function(file) {
            console.log(file)
        })
    }
})
```

`res.contentType(type)`: function
This function will set the content type to respond with, you could also use the `res.setHeader()` function

`res.writeFile(path, data, allowReplaceFile, callback)`: function
This function will save a file
path: the path of the file
If the path contains a non existent folder, the folder will be created
data: string/arrayBuffer of the file. DO NOT SEND OTHER TYPES OF DATA - THIS COULD BREAK THE APP (Just refresh it)
allowReplaceFile: if file exists and you want to replace the file, set this to true
callback: function will be excecuted to tell you if there was an error or it will callback the file

`res.deleteFile(path, callback)`: function
This function will delete
path: the path of the file
callback: function will be excecuted to tell you if there was an error or success

`res.writeCode(httpCode)`: function
Call this to respond with no message. Dont forget to finish with `res.end()`

`res.renderFileContents`: function
Once you have called the file with `res.getFile()` (DO NOT use the `file.file()` function) use `res.renderFileContents()` to render the file
Example:
```
`res.getFile('../somefile.html', function(file) {
    if (file.error) {
        console.log('error')
    } else if (file.isFile) {
        res.renderFileContents(file)
    } else if (file.isDirectory) {
        res.renderFileContents(file[2])
    }
})
```

<h2>Chunked encoding</h2>

`res.writeChunk`: function
This feature will send the data in chunks, instead of all at once.
To enable, you must set the transfer-encoding header to chunked
Like this: `res.setHeader('transfer-encoding','chunked')`

Example:

```
res.setHeader('transfer-encoding','chunked')
res.contentType('text/html; charset=utf-8')
res.writeHeaders(200)
res.writeChunk('This is Chunk number 1')
res.writeChunk('\n\nAnd this is chunk number 2')
res.writeChunk('\n\nAnd this is the last chunk')
res.end() // VERY IMPORTANT (as always)
```

<h1>req Commands</h1>

`req.body`: ArrayBuffer
This is an array buffer of the request body, if there is no request body, the value will be null.
You must use a utf-8 text decoder to read the array (as text)

`req.headers`: json string
This contains all of the headers that the user sent when making the http request

`req.arguments`: json string
This contains all of the arguments that the user has put in the url

`req.method`: string
This contains the request method (should be POST)

`req.uri`: string
This contains the entire requested path

`req.origpath`: string
This contains the requested file (Will end with / if is directory)

`req.path`: string
This contains the requested file. (Will NOT end with / if is directory)


<h1>Another Useful Tool</h1>

`httpRequest`: constructor
This will open a http request as if you opened a new tab and went to the website
Please note: https it not supported

`var request = new httpRequest`

To set a header: `request.setRequestHeader(headerType, headerValue)`

To open the request: `request.open("GET", url)`

Set the onload function: `request.onload = function(e) { }`

Send the request: `request.send()`


To send data, you can use: `request.send(data)`

`window.tempData`: json
This window variable is a place that you can store data if you need. It will NOT be cleared after the end of the response.


<p>Want to create a script compatible between Web Server for Chrome and <a href="https://github.com/terreng/simple-web-server">this server</a>?</p>

The `appInfo` variable will tell you which server you are using

