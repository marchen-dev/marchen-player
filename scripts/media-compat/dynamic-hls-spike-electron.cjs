const { app, BrowserWindow } = require('electron')

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.loadURL(process.env.MARCHEN_DYNAMIC_HLS_SPIKE_URL)
})

app.on('window-all-closed', () => app.quit())
