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
  ThemeProvider,
} = MaterialUI

const {createMuiTheme, colors, withStyles} = MaterialUI;
const styles = {
  card: {margin: '10px'},
  appicon: {marginRight: '10px'},
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


// these arent tested yet
const functions = {
  optVerbose: function(app, k, val) {
    const {bg} = app;
    bg.WSC.VERBOSE = bg.WSC.DEBUG = val
  },
	optVerboseChange: function(val) {
		var k = 'optVerbose'
		this.updateAndSave(k,val)
    bg.WSC.VERBOSE = bg.WSC.DEBUG = val
	},
	updateAndSave: function(k,v) {
		console.log('update and save',k,v)
		webapp.updateOption(k,v)
		appOptions.set(k,v)
	},
  Ready: function() {
    console.log('wsc-options ready')
		window.opts = this
  },
  portmapChange: function(val) {
    console.log('persist setting portmapping',val)
    webapp.updateOption('optDoPortMapping',val)
    appOptions.set('optDoPortMapping',val)
  },
  optAllInterfaces: function(app, k, val) {
    const {webapp} = app;
    webapp.interfaces = []
  },
  interfaceChange: function(val) {
    console.log('persist setting interface',val)
    webapp.opts.optAllInterfaces = val
    webapp.interfaces = []
    appOptions.set('optAllInterfaces',val)
  },
  optPreventSleep: function(app, k, val) {
    const {webapp} = app;
    webapp.updatedSleepSetting()
  },
  preventSleepChange: function(val) {
    console.log('persist setting prevent sleep',val)
    webapp.opts.optPreventSleep = val
    webapp.updatedSleepSetting()
    appOptions.set('optPreventSleep',val)
  },
  autoStartChange: function(val) {
    console.log('persist setting autostart')
    appOptions.set('optAutoStart', val)
    bg.backgroundSettingChange({'optAutoStart':val})
  },
  // backgroundChange: function(val) {
  optBackground: function(app, k, val) {
    const {webapp, bg} = app;
    console.log('background setting changed',val)
		webapp.updateOption('optBackground',val)
    // appOptions.set('optBackground', val)
    bg.backgroundSettingChange({'optBackground':val})
  },
  optRenderIndexChange: function(val) {
    console.log('persist setting renderIndex')
    webapp.opts.optRenderIndex = val
    appOptions.set('optRenderIndex',val)
  },
  port: (app, k, v) => {
    console.log('persist port', v)
    app.webapp.opts.port = v
    app.webapp.port = v
  },
  onPortChange: function() {
		var val = this.port
    var port = parseInt(val)
    console.log('persist port',port)
    webapp.opts.port = port
    webapp.port = port
    appOptions.set('port',port)
  },
	// onClickStartBackground: function(evt) {
  optAutoStart: function(app, k, val) {
    // get existing value
    const {bg, webapp} = app;
		// var val = this.$$('#start-background').active
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
			// appOptions.set('optBackground',val)
			bg.backgroundSettingChange({'optBackground':val})
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
    message: '',
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
    console.log('fetched local settings', this.appOptions, allOpts)
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
      port: null,
    };
    const optAdvanced = {
      optCORS: null,
      optIPV6: null,
      optStatic: null,
      optUpload: null,
      optVerbose: null,
      optModRewriteEnable: null,
      optModRewriteRegexp: ['optModRewriteEnable'],
      optModRewriteNegate: ['optModRewriteEnable'],
      optModRewriteTo: ['optModRewriteEnable']
    }
    console.assert(this)

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
          {state.showAdvanced && <div>{advOptions}</div>}
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

