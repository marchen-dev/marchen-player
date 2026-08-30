import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const wait = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms))

const parseArguments = () => {
  const options = { port: 9333, profile: 'safe', timeoutMs: 90_000 }
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index]
    if (value === '--file') options.file = process.argv[++index]
    else if (value === '--profile') options.profile = process.argv[++index]
    else if (value === '--port') options.port = Number(process.argv[++index])
    else if (value === '--timeout-ms') options.timeoutMs = Number(process.argv[++index])
    else throw new Error(`未知参数：${value}`)
  }
  if (!options.file) throw new Error('缺少 --file <本地 MKV/MP4>')
  if (!['audio', 'safe', 'hdr-sdr'].includes(options.profile)) {
    throw new Error('--profile 只接受 audio、safe 或 hdr-sdr')
  }
  options.file = resolve(options.file)
  if (!existsSync(options.file)) throw new Error(`媒体文件不存在：${options.file}`)
  return options
}

class CdpClient {
  #id = 0
  #pending = new Map()
  #listeners = new Set()

  constructor(url) {
    this.socket = new WebSocket(url)
    this.opened = new Promise((resolve_, reject) => {
      this.socket.addEventListener('open', resolve_, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        this.#pending.get(message.id)?.(message)
        this.#pending.delete(message.id)
        return
      }
      for (const listener of this.#listeners) listener(message)
    })
  }

  async call(method, params = {}) {
    await this.opened
    const id = ++this.#id
    const response = new Promise((resolve_) => this.#pending.set(id, resolve_))
    this.socket.send(JSON.stringify({ id, method, params }))
    const message = await response
    if (message.error) throw new Error(`${method}: ${message.error.message}`)
    return message.result
  }

  onEvent(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  close() {
    this.socket.close()
  }
}

const waitForPage = async (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = pages.find((entry) => entry.type === 'page' && entry.url.includes('/#/player'))
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await wait(200)
  }
  throw new Error(`Electron CDP ${port} 在期限内未就绪`)
}

const poll = async (action, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await action()
    if (last) return last
    await wait(200)
  }
  throw new Error(`${label} 超时`)
}

const terminate = async (child) => {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve_) => {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']).once('exit', resolve_)
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
  }
  await Promise.race([new Promise((resolve_) => child.once('exit', resolve_)), wait(5_000)])
}

const run = async () => {
  const options = parseArguments()
  const outputTail = []
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(command, ['dev', '--', `--remote-debugging-port=${options.port}`], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      MARCHEN_ALLOW_MULTIPLE_INSTANCES: '1',
      VITE_FORCE_TRANSCODE_PROFILE: options.profile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const capture = (chunk) => {
    outputTail.push(chunk.toString('utf8'))
    if (outputTail.length > 80) outputTail.shift()
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  let client
  try {
    const websocketUrl = await waitForPage(options.port, 30_000)
    client = new CdpClient(websocketUrl)
    await client.call('Network.enable')
    const mediaResponses = []
    const offNetwork = client.onEvent((message) => {
      if (message.method !== 'Network.responseReceived') return
      const response = message.params.response
      if (/\/v1\/media\/.*(?:\.m3u8|\.m4s|init\.mp4)/.test(response.url)) {
        mediaResponses.push({
          url: response.url,
          status: response.status,
          mimeType: response.mimeType,
        })
      }
    })

    const document = await client.call('DOM.getDocument')
    const input = await poll(
      async () => {
        const queried = await client.call('DOM.querySelector', {
          nodeId: document.root.nodeId,
          selector: 'input[type=file]',
        })
        return queried.nodeId || undefined
      },
      10_000,
      '播放器文件输入框',
    )
    await client.call('DOM.setFileInputFiles', { nodeId: input, files: [options.file] })

    const readiness = await poll(
      async () => {
        await client.evaluate(
          `[...document.querySelectorAll('button')].find((node) => node.textContent?.includes('不加载弹幕'))?.click()`,
        )
        return client.evaluate(`(() => {
          const video = document.querySelector('video')
          if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 2) return null
          return { duration: video.duration, readyState: video.readyState, source: video.currentSrc || video.src }
        })()`)
      },
      options.timeoutMs,
      'loadedmetadata 与有效 duration',
    )

    const playback = await client.evaluate(
      `(async () => {
      const video = document.querySelector('video')
      const firstFrame = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('first decoded frame timeout')), 15000)
        const decodedFrames = video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
        if (decodedFrames > 0) {
          clearTimeout(timer)
          resolve()
        } else if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve() })
        } else {
          video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve() }, { once: true })
        }
      })
      await video.play()
      await firstFrame
      const firstTime = video.currentTime
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const progressedTime = video.currentTime
      const seekTarget = Math.min(Math.max(1, video.duration / 3), video.duration - 2)
      video.currentTime = seekTarget
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('seek timeout')), 15000)
        video.addEventListener('seeked', () => { clearTimeout(timer); resolve() }, { once: true })
      })
      await video.play()
      const seekedTime = video.currentTime
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return {
        firstTime,
        progressedTime,
        seekTarget,
        seekedTime,
        afterSeekTime: video.currentTime,
        duration: video.duration,
        readyState: video.readyState,
        error: video.error?.code ?? null,
      }
    })()`,
      true,
    )
    offNetwork()

    if (playback.error !== null || playback.progressedTime <= playback.firstTime) {
      throw new Error(`首帧后时间未推进：${JSON.stringify(playback)}`)
    }
    if (playback.afterSeekTime <= playback.seekedTime) {
      throw new Error(`seek 后时间未推进：${JSON.stringify(playback)}`)
    }
    if (!mediaResponses.some((entry) => entry.url.endsWith('.m3u8') && entry.status === 200)) {
      throw new Error(`未观察到成功的 HLS manifest：${JSON.stringify(mediaResponses)}`)
    }
    if (
      !mediaResponses.some((entry) => /init\.mp4|\.m4s$/.test(entry.url) && entry.status === 200)
    ) {
      throw new Error(`未观察到成功的 init/segment：${JSON.stringify(mediaResponses)}`)
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          file: options.file,
          forcedProfile: options.profile,
          producer: {
            manifest: mediaResponses.some((entry) => entry.url.endsWith('.m3u8')),
            initOrSegment: mediaResponses.some((entry) => /init\.mp4|\.m4s$/.test(entry.url)),
          },
          browser: { ...readiness, ...playback },
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(outputTail.join('').slice(-12_000))
    throw error
  } finally {
    client?.close()
    await terminate(child)
  }
}

await run()
