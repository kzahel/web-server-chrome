import {AppOptions, AppOption} from './options.js'

const {
  FormControlLabel,
  Card,
  CardContent,
  Tooltip,
  FormGroup,
  Switch,
  AppBar,
  Container,
  Toolbar,
  Typography,
  Button,
  ThemeProvider
} = MaterialUI

const {Alert} = MaterialUILab;

const {createMuiTheme, colors, withStyles} = MaterialUI;
const styles = {
  card: {margin: '10px'},
  appicon: {marginRight: '10px'}
};
const theme = createMuiTheme({
  palette: {
    primary: {
      main: '#3f51b5',
    },
    secondary: colors.blueGrey,
  },
  status: {
    danger: 'orange',
  },
});


const functions = {
  optVerbose: function(app, k, val) {
    const {bg} = app;
    bg.WSC.VERBOSE = bg.WSC.DEBUG = val
  },
  optAllInterfaces: function(app, k, val) {
    app.webapp.interfaces = []
  },
  optIPV6: function(app, k, val) {
    // reset the list of interfaces
    app.webapp.interfaces = []
  },
  optPreventSleep: function(app, k, val) {
    // do it after the setting is changed
    setTimeout(() => {
      app.webapp.updatedSleepSetting()
    }, 1);
  },
  optBackground: function(app, k, val) {
    const {webapp, bg} = app;
    console.log('background setting changed',val)
		webapp.updateOption('optBackground',val)
    // appOptions.set('optBackground', val)
    bg.backgroundSettingChange({'optBackground':val})
  },
  port: (app, k, v) => {
    console.log('persist port', v)
    console.assert(typeof v === 'number')
    app.webapp.opts.port = v
    app.webapp.port = v // does it still need to be set here?
  },
  optAutoStart: function(app, k, val) {
    const {bg, webapp} = app;
		if (val) {
			chrome.permissions.request({permissions:['background']}, function(result) {
				console.log('request perm bg',result)
				if (result) {
					success()
				}
			})
		} else {
			chrome.permissions.remove({permissions:['background']}, function(result) {
				console.log('drop perm bg',result)
				success()
			})
		}
		function success() {
			console.log('persist setting start in background',val)
			webapp.opts.optBackground = val
			bg.backgroundSettingChange({'optBackground':val})
		}
  },
  optCustom404location: (app, k, val) => {
    console.assert(typeof val === 'string')
    app.webapp.updateOption('optCustom404location', val);
  },
  optCustom404usevarvar: (app, k, val) => {
    console.assert(typeof val === 'string')
    app.webapp.updateOption('optCustom404usevarvar', val);
  },
  optPrivateKey: (app, k, val) => {
    //console.log('privateKey')
    console.assert(typeof val === 'string')
    app.webapp.updateOption('optPrivateKey', val);
  },
  optCertificate: (app, k, val) => {
    //console.log('certificate');
    console.assert(typeof val === 'string')
    app.webapp.updateOption('optCertificate', val);
  },
  optUseHttps: (app, k, val) => {
    console.log("useHttps", val);
    app.webapp.updateOption('optUseHttps', val);
    if (app.webapp.started) {
      app.webapp.stop();
    }
  }
};


window.reload = chrome.runtime.reload
setup_events()
function setup_events() {
  function keydown(evt) {
    if (evt.metaKey || evt.ctrlKey) {
      if (evt.keyCode == 82) {
        // ctrl-r
        console.log('received ctrl(meta)-r, reload app')
        if (window.fgapp) {
          fgapp.reload()
        } else {
          chrome.runtime.reload()
        }
      }
      //evt.preventDefault() // dont prevent ctrl-w
    }
  }
  document.body.addEventListener('keydown', keydown)
}


class App extends React.Component {
  state = {
    showAdvanced: false,
    interfaces: [],
    port: 6669,
    started: false,
    starting: false,
    lasterr: null,
    folder: null,
    message: ''
  }
  constructor(props) {
    super(props)
    this.classes = props.classes; // styling api
    window.app = this
    console.log('app created');
    this.init()
  }
  async init() {
    this.bg = await chromise.runtime.getBackgroundPage()
    this.appOptions = new AppOptions(this.settings_ready.bind(this))
  }
  settings_ready() {
    const allOpts = this.appOptions.getAll()
    let dCpy = {};
    Object.assign(dCpy, allOpts);
    delete dCpy.optPrivateKey;// dont fill logs with crypto info
    delete dCpy.optCertificate;

    console.log('fetched local settings', this.appOptions, dCpy)
    this.webapp = this.bg.get_webapp(allOpts) // retainStr in here
    this.bg.WSC.VERBOSE = this.bg.WSC.DEBUG = this.appOptions.get('optVerbose')
    this.webapp.on_status_change = this.on_webapp_change.bind(this)
    this.setState(allOpts);
    this.on_webapp_change()
    this.ui_ready()
  }
  get_status() {
    const result = {
      starting: this.webapp && this.webapp.starting,
      started: this.webapp && this.webapp.started,
      lasterr: this.webapp && this.webapp.lasterr,
      folder: this.webapp &&
              this.webapp.fs &&
              this.webapp.fs.entry &&
              this.webapp.fs.entry.fullPath,
    }
    result.message = this.computeMessage(result)
    return result
  }
  computeMessage({started, starting, lasterr}) {
    if (lasterr) {
      return JSON.stringify(lasterr)
    } else if (starting) {
      return 'STARTING'
    } else if (started) {
      return 'STARTED'
    } else {
      return 'STOPPED'
    }
  }
  on_webapp_change() {
    var status = this.get_status()
    console.log('webapp changed',status)
    this.setState({
      ...status,
      port: this.webapp.port,
      interfaces: this.webapp.urls.slice()
    })
  }
  gen_crypto() {
  	let reasonStr = this.webapp.opts.optPrivateKey ? "private key" :
  	                   this.webapp.opts.optCertificate ? "certificate" : "";
  	if (reasonStr) {
      console.warn("Would overwrite existing " + reasonStr + ", erase it first\nMake sure to save a copy first");
      return;
    }
    let cn = "WebServerForChrome" + (new Date()).toISOString();
    let data = this.webapp.createCrypto(cn);
    this.appOptions.set('optPrivateKey', data[cn].privateKey);
    this.appOptions.set('optCertificate', data[cn].cert);
    this.webapp.updateOption('optPrivateKey', data[cn].privateKey);
    this.webapp.updateOption('optCertificate', data[cn].cert);
    this.setState({optPrivateKey: data[cn].privateKey, optCertificate: data[cn].cert});
    setTimeout(this.render, 50); // prevent race condition when ReactElement get set before opts have value
  }
  ui_ready() {
    if (this.webapp) {
      if (! (this.webapp.started || this.webapp.starting)) {
        // autostart ?
        this.webapp.start()
      }
    }
  }
  choose_folder() {
    console.log('clicked choose folder')
    function onfolder(folder) {
      this.bg.onchoosefolder(folder)
    }
    chrome.fileSystem.chooseEntry({type:'openDirectory'}, onfolder.bind(this))
  }
  startStop(evt, checked) {
    console.log('startstop', checked)
    if (checked) this.webapp.start()
    else this.webapp.stop()
  }
  onChange(k, v) {
		console.log('update and save',k,v)
		this.webapp.updateOption(k,v) // also set on webapp.opts ?
    // certain options require special manual handling (e.g. port has to set this.webapp.opts.port)
    if (functions[k]) {
      console.log('special handling for', k);
      functions[k](this, k, v)
    }
		this.appOptions.set(k,v)
    this.setState({[k]:v})
  }
  render() {
    // option: [dependencies]
    const optDisplay = {
      optBackground: null,
      optAutoStart: ['optBackground'],
      optAllInterfaces: null,
      optDoPortMapping: ['optAllInterfaces'],
      optPreventSleep: null,
      optRenderIndex: null,
      optDir404: ['optRenderIndex'],
      port: null,
    };
    const optAdvanced = {
      optCORS: null,
      optIPV6: null,
      optStatic: null,
      optUpload: null,
      optDelete: null,
      optVerbose: null
    };
    const optCustom404Main = {
      optCustom404: null
    };
    const optCustom404Info = {
      optCustom404location: ['optCustom404'],
      optCustom404usevar: ['optCustom404'],
      optCustom404usevarvar: ['optCustom404','optCustom404usevar']
    };
    const optRewrite = {
      optModRewriteEnable: null
    };
    const optRewriteInfo = {
      optModRewriteRegexp: ['optModRewriteEnable'],
      optModRewriteNegate: ['optModRewriteEnable'],
      optModRewriteTo: ['optModRewriteEnable']
    };
    const optHttps = {
      optUseHttps: null
    };
    const optHttpsInfo = {
      optPrivateKey: null,
      optCertificate: null
    };
    console.assert(this);

    const renderOpts = (opts) => {
      const _this = this;
      const options = [Object.keys(opts).map(k => {
        const deps = opts[k] || []
        let enabled = true
        let indent = false
        for (const dep of deps) {
          indent = true
          if (!this.state[dep]) {
            enabled = false
          }
        }
        return <AppOption indent={indent} disabled={!enabled} onChange={this.onChange.bind(this)} name={k} key={k} value={this.state[k]} appOptions={_this.appOptions} />
      })];
      return options;
    }

    const options = renderOpts(optDisplay)
    const advOptions = renderOpts(optAdvanced)
    const advancedButton = (<div><a href="#" onClick={e => {
      e.preventDefault();
      this.setState({showAdvanced: !this.state.showAdvanced})
    }}
    >{this.state.showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}</a></div>)

    const Custom404Main = renderOpts(optCustom404Main)

    const Custom404Options = (() => {
      let disabletwo = (!this.webapp || !this.webapp.opts.optCustom404);
      const textboxestwo = renderOpts(optCustom404Info)
      return [(<div>{!disabletwo && textboxestwo}</div>)];
    })();

    const rewriteMain = renderOpts(optRewrite)

    const rewriteOptions = (() => {
      let disableone = (!this.webapp || !this.webapp.opts.optModRewriteEnable);
      const textboxesone = renderOpts(optRewriteInfo)
      return [(<div>{!disableone && textboxesone}</div>)];
    })();

    const httpsMain = renderOpts(optHttps)

    const httpsOptions = (() => {
      let disable = (!this.webapp || !this.webapp.opts.optUseHttps);
      let hasCrypto = this.webapp && (this.webapp.opts.optPrivateKey || this.webapp.opts.optCertificate);
      const textBoxes = renderOpts(optHttpsInfo)
      return [(<div style={{paddingLeft: 20}}>{!disable && textBoxes}
        {hasCrypto && !disable && <Alert severity="info">To regenerate, remove key and cert. Be sure to take a copy first, for possible later use!</Alert>}
        {!disable && <Button variant="contained" key="crytobtn" disabled={hasCrypto  ? true : false} onClick={e => {
				  e.preventDefault();
				  this.gen_crypto();
				}}>Generate crypto</Button>}
	  </div>)];
    })();

    const {state} = this;
    return (<div>
      <ThemeProvider theme={theme}>

      <AppBar position="static" color="primary">
        <Toolbar>
          <img className={this.classes.appicon} src="/images/200ok-64.png" />
          <Typography variant="h6" type="title" color="inherit">
            Web Server for Chrome
          </Typography>
        </Toolbar>
      </AppBar>
      <Container>
      <Card className={this.classes.card}>
        <CardContent>
          <p>Please <a
                      target="_blank"
                      href="https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb/reviews"
            >leave a review</a> to help others find this software.
          </p>
        </CardContent>
      </Card>

      <Card className={this.classes.card}>
        <CardContent>

          <FormGroup>
            <Tooltip title={'Click to start or stop the web server'}>
              <FormControlLabel
                label={`Web Server: ${state.message}`}
                control={(
                  <Switch
                    disabled={state.starting}
                             checked={state.started}
                             onChange={this.startStop.bind(this)}
                  />)}
              />
            </Tooltip>
          </FormGroup>

          <div>
            <Button variant="contained" onClick={this.choose_folder.bind(this)}>Choose Folder</Button>
            <span>{state.folder ? ` Current: ${state.folder}` : 'NO FOLDER SELECTED'}</span>
          </div>

          <h3>Web Server URL(s)</h3>
          <ul style={{WebkitUserSelect:'text'}}>
            {state.interfaces.map((item) => {
              return <li key={item.url}><a href={item.url} target="_blank">{item.url}</a></li>
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className={this.classes.card}>
        <CardContent>
          <Tooltip title={'Some options may require a restart of the server. Restart by pressing the toggle button above'}>
            <span>Options (may require restart)</span>
          </Tooltip>
          
          {options}

          {advancedButton}
          {state.showAdvanced && <div>{advOptions}{Custom404Main}{Custom404Options}{rewriteMain}{rewriteOptions}{httpsMain}{httpsOptions}</div> }
        </CardContent>
      </Card>

      <Card className={this.classes.card}>
        <CardContent>
          <p>Need to <a target="_blank" href="https://github.com/kzahel/web-server-chrome/issues">Report a problem</a>?
            Open source, MIT license.</p>
        </CardContent>
      </Card>
      </Container>

    </ThemeProvider>
    </div>)
  }
}

const AppWithStyles = withStyles(styles)(App);

ReactDOM.render(<AppWithStyles />, document.getElementById('app'))

