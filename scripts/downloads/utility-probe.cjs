const path = require('node:path')
/** Electron utilityProcess 原生依赖加载探针，不创建窗口。 */
const { app, utilityProcess } = require('electron')
app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'utility-worker.mjs'), [], {
    stdio: 'pipe',
  })
  let passed = false
  const timer = setTimeout(() => {
    child.kill()
    app.exit(1)
  }, 15000)
  child.stdout.on('data', (value) => process.stdout.write(value))
  child.stderr.on('data', (value) => process.stderr.write(value))
  child.on('message', (result) => {
    passed = result.ok === true
    console.log(JSON.stringify(result))
  })
  child.on('exit', (code) => {
    clearTimeout(timer)
    app.exit(passed && code === 0 ? 0 : 1)
  })
})
