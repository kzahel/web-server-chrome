const { FormControlLabel } = MaterialUI
const { FormGroup } = MaterialUI
const {
  Switch,
  Checkbox,
  Tooltip,
  TextField,
} = MaterialUI

export function AppOption({disabled, indent, name, value, appOptions, onChange: parentOnChange}) {
  if (! appOptions) return 'Loading...'
  const meta = appOptions.meta[name];
  const {type, label, validation} = meta;

  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    // onChange(null, value) // why ?
  }, []);

  function onChange(evt, inval) {
    let val = inval === undefined ? evt.target.value : inval;
    if (meta.process) val = meta.process(val)
    console.log('onChange', val);
    if (validation) {
      const newError = !validation(val)
      if (error != newError) {
        setError(newError)
      }
    }
    parentOnChange(name, val)
  }

  function renderOption() {
    switch(type) {
      case Number: {
        return (
          <TextField
            disabled={disabled}
            error={error}
            helperText={error ? meta.validationError : ''}
            onChange={onChange}
            value={value}
            label={label}
            type="number"
            InputLabelProps={{
              shrink: true,
            }}
            margin="normal"
          />
        )
      }
      case Boolean: {
        return (<FormGroup>
          <Tooltip title={meta.help || ''}>
            <FormControlLabel
              label={meta.label}
              control={(
                <Checkbox
                  disabled={disabled}
                           checked={!!value}
                           onChange={onChange}
                />)}
            />
          </Tooltip>
        </FormGroup>)
      }
      case String: {
        return (
          <TextField
            disabled={disabled}
            onChange={onChange}
            helperText={meta.label}
            label={meta.label}
            margin="normal"
            value={value}
          />
        )
      }
      default:
        return <div>Option with {name} ({meta.type}) - {appOptions.get(name)}</div>
    }
  }

  return (<div style={{marginLeft: indent ? '20px' : '0px'}}>
    {renderOption()}
  </div>)

}

const options = {
  port: {
    name: "Port",
    label: 'Enter Port',
    help: 'Which port the web server will listen on',
    process: val => parseInt(val, 10),
    validation: (val) => {
      return val >= 1024 && val <= 65535
    },
    validationError: 'Enter a number between 1024 and 65535',
    type: Number,
    default: 8887
  },
  optAllInterfaces: {
    label: 'Accessible on local network',
    help: 'Make the web server available to other computers on the local area network',
    type: Boolean,
    default: false
  },
  optDoPortMapping: {
    label: 'Also on internet',
    help: 'Attempt to open up a port on your internet router to make the server also available on the internet',
    type: Boolean,
    default: false
  },
  optIPV6: {
    label: 'Listen on IPV6',
    help: 'To have the server listen with IPV6',
    type: Boolean,
    default: false
  },
  optCORS: {
    label: 'Set CORS headers',
    help: 'To allow XMLHttpRequests from other origins',
    type: Boolean,
    default: false
  },
  optVerbose: {
    label: 'Verbose logging',
    help: 'To see web server logs, (navigate to "chrome://inspect", Extensions)',
    type: Boolean,
    default: false
  },
  optStatic: {
    label: 'Plain (static) files view',
    help: 'The files directory listing will not use any javascript',
    type: Boolean,
    default: false
  },
  optTryOtherPorts: {
    type: Boolean,
    default: false
  },
  optRetryInterfaces: {
    type: Boolean,
    visible: false,
    default: true
  },
  optUsebasicauth: {
    label: 'Use basic auth',
    help: 'Webserver will require auth to access',
    type: Boolean,
    default: false
  },
  optAuthUsername: {
    label: 'Username',
    help: 'Username',
    type: String,
    default: 'admin'
  },
  optAuthPassword: {
    label: 'Password',
    help: 'Password',
    type: String,
    default: 'admin'
  },
  optCacheControl: {
    label: 'Enable Cache Control Header',
    help: 'Client will cache requests according to header value',
    type: Boolean,
    default: false
  },
  optCacheControlValue: {
    label: 'Cache control header value',
    help: 'Do not include "Cache-Control: " part of the header, only the info after that',
    type: String,
    default: 'must-revalidate'
  },
  optPreventSleep: {
    label: 'Prevent computer from sleeping',
    help: 'If the server is running, prevent the computer from going into sleep mode',
    type: Boolean,
    default: false
  },
  optBackground: {
    label: 'Run in background',
    help: 'Allow the web server to continue running, even if you close this window',
    type: Boolean,
    default: false
  },
  optAutoStart: {
    label: 'Start on login',
    help: 'Start the web server when you login, even if the web server window is not opened',
    depends: [{optBackground: true}],
    type: Boolean,
    default: false
  },
  optRenderIndex: {
    label: 'Automatically show index.html',
    help: 'If the URL is a directory, automatically show an index.html if one is present',
    type: Boolean,
    default: true
  },
  optDir404: {
    label: '404 instead of directory listing',
    help: 'When no index.html is found in a directory, you will get a 404 error',
    type: Boolean,
    default: false
  },
  optCustom400: {
    label: 'Custom 400 page',
    help: 'Custom 400 page',
    type: Boolean,
    default: false
  },
  optCustom400location: {
    label: 'Location of 400 page',
    help: 'Where is the 400 html page',
    type: String,
    default: '/400.html'
  },
  optCustom404: {
    label: 'Custom 404 page',
    help: 'Custom 404 page',
    type: Boolean,
    default: false
  },
  optCustom404location: {
    label: 'Location of 404 page',
    help: 'Where is the 404 html page',
    type: String,
    default: '/404.html'
  },
  optCustom404usevar: {
    label: 'Send variable? (Javascript)',
    help: 'Javascript Variable to customize html (Variable is equal to user request path)',
    type: Boolean,
    default: false
  },
  optCustom404usevarvar: {
    label: 'Variable name',
    help: 'Name of variable to send',
    type: String,
    default: 'locationoflostuser'
  },
  optCustom403: {
    label: 'Custom 403 page',
    help: 'Custom 403 page',
    type: Boolean,
    default: false
  },
  optCustom403location: {
    label: 'Location of 403 page',
    help: 'Where is the 403 html page',
    type: String,
    default: '/403.html'
  },
  optCustom401: {
    label: 'Custom 401 page',
    help: 'Custom 401 page',
    type: Boolean,
    default: false
  },
  optCustom401location: {
    label: 'Location of 401 page',
    help: 'Where is the 401 html page',
    type: String,
    default: '/401.html'
  },
  optUpload: {
    label: 'Allow File upload',
    help: 'The files directory listing allows drag-and-drop to upload small files',
    type: Boolean,
    default: false
  },
  optAllowReplaceFile: {
    label: 'Allow Replace file',
    help: 'Will allow the user to overwrite a file',
    type: Boolean,
    default: false
  },
  optDelete: {
    label: 'Allow Deleting Files',
    help: 'Enables the delete request',
    type: Boolean,
    default: false
  },
  optIpBlocking: {
    label: 'Search for IP block list',
    help: 'Search for IP block list',
    type: Boolean,
    default: false
  },
  optIpBlockList: {
    label: 'Location of ip block list',
    help: 'Path to the ip block list',
    type: String,
    default: '/ipBlock.list'
  },
  optIpBlockUndefined: {
    label: 'Block requests with an undefined ip',
    help: 'When the request has no ip address, terminate the connection',
    type: Boolean,
    default: false
  },
  optModRewriteEnable: {
    label: 'Enable mod-rewrite (for SPA)',
    help: 'For SPA (single page apps) that support HTML5 history location',
    type: Boolean,
    default: false
  },
  optModRewriteRegexp: {
    label: 'Regular Expression',
    help: 'Any URL matching this regular expression will be rewritten',
    type: String,
    default: ".*\\.[\\d\\w]+$" // looks like a file extension
  },
  optModRewriteNegate: {
    label: 'Negate Regexp',
    help: 'Negate the matching logic in the regexp',
    type: Boolean,
    default: true
  },
  optModRewriteTo: {
    label: 'Rewrite To',
    help: 'Which file to server instead of the actual path. For example, /index.html',
    type: String,
    default: '/index.html'
  },
  optExcludeDotHtml: {
    label: 'Exclude .html extension from url',
    help: 'Will not show .html extension in url path',
    type: Boolean,
    default: false
  },
  optExcludeDotHtm: {
    label: 'Instead, Exclude .htm extension',
    help: 'Will not show .htm extension in url path',
    type: Boolean,
    default: false
  },
  optScanForHtaccess: {
    label: 'Look for wsc.htaccess files',
    help: 'Check for more info',
    type: Boolean,
    default: false
  },
  optGETHtaccess: {
    label: 'Allow GET request for htaccess files',
    help: 'will allow the user to request and view htaccess files',
    type: Boolean,
    default: false
  },
  optPUTPOSTHtaccess: {
    label: 'Allow PUT/POST requests for htaccess files',
    help: 'Will allow user to upload wsc.htaccess files',
    type: Boolean,
    default: false
  },
  optDELETEHtaccess: {
    label: 'Allow Delete request for htaccess files',
    help: 'Will allow user to delete htaccess files',
    type: Boolean,
    default: false
  },
  optDirListingHtaccess: {
    label: 'Show in directory listing',
    help: 'Htaccess files will show in directory listing',
    type: Boolean,
    default: false
  },
  optDotFilesDirListing: {
    label: 'Show dot files in directory listing',
    help: 'Show/hide files starting with dot',
    type: Boolean,
    default: false
  },
  optUseHttps: {
    label: 'Use https://',
    help: 'Serve pages through https://',
    type: Boolean,
    default: false
  },
  optPrivateKey: {
      label: 'Private key string',
      help: "String containg private key, used in pair with certificate string.\nEdit them in pairs",
      type: String
  },
  optCertificate: {
      label: 'Certificate string',
      help: "String containg certificate, used in pair with private key string.\nEdit them in pairs",
      type: String 
  },
  optSaveLogs: {
    label: 'Save Logs To File',
    help: 'All logs will be saved to a file',
    type: Boolean,
    default: false
  },
  optSaveLogsInterval: {
    label: 'Save Logs Every _ minutes',
    help: "Save Logs Every _ minutes. The higher, the less likely an error will happen",
    type: Number,
    default: 10
  },
  optSaveLogsFilename: {
    label: 'Path to save log file',
    help: "Where to save log file",
    type: String,
    default: '/wsc.log'
  }
}

export class AppOptions {
  constructor(callback) {
      this.meta = options
      this.options = null

      chrome.storage.local.get(null, function(d) {
          this.options = d
          // update options with default options
          callback()
      }.bind(this))
  }
  get(k) {
        if (this.options[k] !== undefined) return this.options[k]
        return this.meta[k].default
    }
    getAll() {
        var d = {}
        Object.assign(d, this.options)
        for (var key in this.meta) {
            if (d[key] === undefined && this.meta[key].default !== undefined) {
                d[key] = this.meta[key].default
            }
        }
        return d
    }
    set(k,v) {
        this.options[k] = v
        var d = {}
        d[k] = v
        chrome.storage.local.set(d, function(){})
    }
}
