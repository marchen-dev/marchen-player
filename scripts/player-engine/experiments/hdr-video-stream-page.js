const $ = (id) => document.getElementById(id)
const native = $('native')
const streamed = $('streamed')
const diagnostic = $('diagnostic')
const result = { stages: [], errors: [] }
window.hdrResult = result
const describe = (frame) => ({
  format: frame.format,
  colorSpace: frame.colorSpace.toJSON(),
  width: frame.displayWidth,
  height: frame.displayHeight,
})
const update = () => {
  diagnostic.textContent = JSON.stringify(result, null, 2)
}
const fail = (error) => {
  result.errors.push(String(error))
  $('status').textContent = `实验失败：${error}`
  update()
}
let timer,
  generator,
  writer,
  frames = [],
  index = 0,
  busy = false,
  stopped = false
let feeding = true
let sent = 0
let presented = 0
const countFrame = () =>
  streamed.requestVideoFrameCallback(() => {
    presented++
    if (!stopped) countFrame()
  })
async function send() {
  if (busy || stopped || !feeding || !frames.length) return
  busy = true
  try {
    // 循环短夹具，仅改时间戳；不经过 Canvas、纹理导入或像素读取。
    const frame = new VideoFrame(frames[index++ % frames.length], {
      timestamp: Math.round(performance.now() * 1000),
    })
    try {
      await writer.write(frame)
      sent++
    } finally {
      frame.close()
    }
  } catch (error) {
    fail(error)
    clearInterval(timer)
  } finally {
    busy = false
  }
}
async function capture(label) {
  const stage = { label, presented, sent, feeding, paused: streamed.paused }
  for (const [name, video] of [
    ['native', native],
    ['streamed', streamed],
  ]) {
    try {
      // 这里只取帧格式和色彩标签，不把它们当作屏幕亮度证明。
      const frame = new VideoFrame(video)
      stage[name] = describe(frame)
      frame.close()
    } catch (error) {
      stage[name] = { error: String(error) }
    }
  }
  result.stages.push(stage)
  update()
  return stage
}
window.captureHdrStage = capture
window.pauseHdr = async () => {
  feeding = false
  clearInterval(timer)
  native.pause()
  streamed.pause()
  $('status').textContent = '已暂停：观察中间一排是否变暗、偏色或变黑'
}
window.freezeHdr = async () => {
  // 保留 video 的播放状态，仅关闭应用送帧；等待最后一次写入结束。
  feeding = false
  clearInterval(timer)
  while (busy) await new Promise((resolve) => setTimeout(resolve, 10))
  native.pause()
  $('status').textContent = '停帧中：中排 video 保持播放状态，但不再送帧。观察高光是否保持。'
}
window.resumeHdr = async () => {
  clearInterval(timer)
  feeding = true
  const playing = Promise.all([native.play(), streamed.play()])
  timer = setInterval(send, 1000 / 24)
  await send()
  await playing
  $('status').textContent = '播放中：比较三排右侧高光；标签相同不代表屏幕 HDR 已通过'
}
$('pause').onclick = () => window.pauseHdr().catch(fail)
$('freeze').onclick = () => window.freezeHdr().catch(fail)
$('resume').onclick = () => window.resumeHdr().catch(fail)
$('capture').onclick = () => capture('手动记录').catch(fail)
window.addEventListener('beforeunload', () => {
  stopped = true
  clearInterval(timer)
  generator?.stop()
  frames.forEach((frame) => frame.close())
})
async function start() {
  result.environment = {
    userAgent: navigator.userAgent,
    dynamicRange: matchMedia('(dynamic-range: high)').matches,
    videoDynamicRange: matchMedia('(video-dynamic-range: high)').matches,
    generator: typeof MediaStreamTrackGenerator,
  }
  if (typeof MediaStreamTrackGenerator !== 'function')
    throw new Error('当前环境没有 MediaStreamTrackGenerator')
  const fixture = await (await fetch('/fixture.json')).json()
  const config = {
    ...fixture.config,
    description: new Uint8Array(fixture.config.description),
    hardwareAcceleration: 'prefer-hardware',
  }
  const support = await VideoDecoder.isConfigSupported(config)
  result.configSupported = support.supported
  if (!support.supported) throw new Error('不支持夹具的 WebCodecs 配置')
  let decodeError
  const decoder = new VideoDecoder({
    output: (frame) => frames.push(frame),
    error: (error) => {
      decodeError = error
    },
  })
  try {
    decoder.configure(config)
    for (const packet of fixture.packets)
      decoder.decode(new EncodedVideoChunk({ ...packet, data: new Uint8Array(packet.data) }))
    await decoder.flush()
    if (decodeError) throw decodeError
  } finally {
    decoder.close()
  }
  if (!frames.length) throw new Error('没有解码帧')
  result.decoded = { count: frames.length, ...describe(frames[0]) }
  const canvas = $('canvas')
  canvas.width = frames[0].displayWidth
  canvas.height = frames[0].displayHeight
  canvas.getContext('2d', { alpha: false }).drawImage(frames[0], 0, 0)
  generator = new MediaStreamTrackGenerator({ kind: 'video' })
  writer = generator.writable.getWriter()
  streamed.srcObject = new MediaStream([generator])
  countFrame()
  // 先送帧再等待 play，避免尚无首帧时相互等待。
  timer = setInterval(send, 1000 / 24)
  await send()
  await Promise.all([native.play(), streamed.play()])
  $('status').textContent = '播放中：比较三排右侧高光；标签相同不代表屏幕 HDR 已通过'
  window.hdrReady = true
  await capture('初始播放')
}
start().catch(fail)
