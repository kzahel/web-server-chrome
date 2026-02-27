const {
  FormControlLabel
} = MaterialUI;
const {
  FormGroup
} = MaterialUI;
const {
  Switch,
  Checkbox,
  Tooltip,
  TextField
} = MaterialUI;
export function AppOption({
  disabled,
  indent,
  name,
  value,
  appOptions,
  onChange: parentOnChange
}) {
  if (!appOptions) return 'Loading...';
  const meta = appOptions.meta[name];
  const {
    type,
    label,
    validation
  } = meta;
  const [error, setError] = React.useState(false);
  React.useEffect(() => {// onChange(null, value) // why ?
  }, []);

  function onChange(evt, inval) {
    let val = inval === undefined ? evt.target.value : inval;
    if (meta.process) val = meta.process(val);
    console.log('onChange', val);

    if (validation) {
      const newError = !validation(val);

      if (error != newError) {
        setError(newError);
      }
    }

    parentOnChange(name, val);
  }

  function renderOption() {
    switch (type) {
      case Number:
        {
          return /*#__PURE__*/React.createElement(TextField, {
            disabled: disabled,
            error: error,
            helperText: error ? meta.validationError : '',
            onChange: onChange,
            value: value,
            label: label,
            type: "number",
            InputLabelProps: {
              shrink: true
            },
            margin: "normal"
          });
        }

      case Boolean:
        {
          return /*#__PURE__*/React.createElement(FormGroup, null, /*#__PURE__*/React.createElement(Tooltip, {
            title: meta.help || ''
          }, /*#__PURE__*/React.createElement(FormControlLabel, {
            label: meta.label,
            control: /*#__PURE__*/React.createElement(Checkbox, {
              disabled: disabled,
              checked: !!value,
              onChange: onChange
            })
          })));
        }

      case String:
        {
          return /*#__PURE__*/React.createElement(TextField, {
            disabled: disabled,
            onChange: onChange,
            helperText: meta.label,
            label: meta.label,
            margin: "normal",
            value: value
          });
        }

      default:
        return /*#__PURE__*/React.createElement("div", null, "Option with ", name, " (", meta.type, ") - ", appOptions.get(name));
    }
  }

  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: indent ? '20px' : '0px'
    }
  }, renderOption());
}
const options = {
  port: {
    name: "Port",
    label: 'Enter Port',
    help: 'Which port the web server will listen on',
    process: val => parseInt(val, 10),
    validation: val => {
      return val >= 1024 && val <= 65535;
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
    depends: [{
      optBackground: true
    }],
    type: Boolean,
    default: false
  },
  optRenderIndex: {
    label: 'Automatically show index.html',
    help: 'If the URL is a directory, automatically show an index.html if one is present',
    type: Boolean,
    default: true
  },
  optUpload: {
    label: 'Allow File upload',
    help: 'The files directory listing allows drag-and-drop to upload small files',
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
  }
};
export class AppOptions {
  constructor(callback) {
    this.meta = options;
    this.options = null;
    chrome.storage.local.get(null, function (d) {
      this.options = d; // update options with default options

      callback();
    }.bind(this));
  }

  get(k) {
    if (this.options[k] !== undefined) return this.options[k];
    return this.meta[k].default;
  }

  getAll() {
    var d = {};
    Object.assign(d, this.options);

    for (var key in this.meta) {
      if (d[key] === undefined && this.meta[key].default !== undefined) {
        d[key] = this.meta[key].default;
      }
    }

    return d;
  }

  set(k, v) {
    this.options[k] = v;
    var d = {};
    d[k] = v;
    chrome.storage.local.set(d, function () {});
  }

}
//# sourceMappingURL=options.js.map