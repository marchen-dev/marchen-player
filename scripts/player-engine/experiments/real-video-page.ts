import { VideoFramePresenter } from '../../../src/renderer/src/services/media/compat/video-frame-presenter'
import { CompatMediaAdapter } from '../../../src/renderer/src/services/media/compat/media-adapter'
const $ = (id: string) => document.getElementById(id)!
let adapter: CompatMediaAdapter | undefined
let presenter: VideoFramePresenter | undefined
let session = 0
let dragging = false
const errors: string[] = []
const samples: unknown[] = []
const fail = (error: unknown) => {
  errors.push(String(error))
  $('status').textContent = `失败：${error}`
}
function diagnostic() {
  if (!adapter) return {}
  const snapshot = adapter.getSnapshot()
  const renderer = presenter
  let output
  try {
    const frame = new VideoFrame(document.querySelector<HTMLVideoElement>('#video')!)
    output = { format: frame.format, colorSpace: frame.colorSpace.toJSON() }
    frame.close()
  } catch {
    /* 首帧加载中 */
  }
  return {
    snapshot,
    decoding: adapter.getPresentation(),
    rendering: renderer && {
      submitted: renderer.submittedFrames,
      presented: renderer.presentedFrames,
    },
    output,
    errors: [...errors],
    videoPaused: document.querySelector<HTMLVideoElement>('#video')!.paused,
  }
}
async function openFile(file: File) {
  adapter?.destroy()
  errors.length = 0
  $('status').textContent = '正在打开本地文件……'
  presenter = new VideoFramePresenter(document.querySelector<HTMLVideoElement>('#video')!)
  adapter = new CompatMediaAdapter(presenter, async () => ({
    source: { kind: 'file', file },
    assetBase: `${location.origin}/wasm/libav/0.1.1`,
    release() {},
    forceSoftware: document.querySelector<HTMLInputElement>('#software')!.checked,
  }))
  adapter.events$.subscribe((event) => {
    if (event.type === 'error') fail(JSON.stringify(event))
  })
  adapter.setSource({ engine: 'compat', resourceId: 'local-file', id: 'local-file' }, ++session)
  await adapter.waitForPlayableData()
  adapter.setVolume(0.35)
  const tracks = adapter.getAudioTracks()
  const select = document.querySelector<HTMLSelectElement>('#audio')!
  select.replaceChildren(
    ...tracks.tracks.map((track) => {
      const option = document.createElement('option')
      option.value = String(track.id)
      option.textContent = `${track.label} ${track.codec ?? ''}`
      option.selected = track.id === tracks.selectedId
      return option
    }),
  )
  await adapter.play()
  $('status').textContent = '播放中：音频与时钟来自现有适配器，视频使用正式 VideoFramePresenter'
}
function seek(time: number) {
  adapter?.seek(time)
}
document.querySelector<HTMLInputElement>('#file')!.onchange = (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void openFile(file).catch(fail)
}
$('pause').onclick = () => {
  adapter?.pause()
  $('status').textContent = '已暂停媒体时钟与音频；video 保持最后一帧'
}
$('play').onclick = () => void adapter?.play().catch(fail)
$('back').onclick = () => seek(Math.max(0, (adapter?.getSnapshot().currentTime ?? 0) - 10))
$('forward').onclick = () => seek((adapter?.getSnapshot().currentTime ?? 0) + 10)
$('stop').onclick = () => {
  adapter?.destroy()
  adapter = undefined
  $('status').textContent = '媒体资源已关闭，可重新选择文件'
}
document.querySelector<HTMLSelectElement>('#rate')!.onchange = (event) => {
  adapter?.setRate(Number((event.target as HTMLSelectElement).value))
}
document.querySelector<HTMLSelectElement>('#audio')!.onchange = (event) => {
  void adapter?.selectAudioTrack(Number((event.target as HTMLSelectElement).value)).catch(fail)
}
const range = document.querySelector<HTMLInputElement>('#seek')!
range.onpointerdown = () => {
  dragging = true
}
range.onchange = () => {
  dragging = false
  seek(Number(range.value))
}
range.onpointerup = () => {
  dragging = false
}
setInterval(() => {
  if (!adapter) return
  const d = diagnostic()
  const state = adapter.getSnapshot()
  if (!dragging) {
    range.max = String(state.duration)
    range.value = String(state.currentTime)
  }
  $('time').textContent = `${state.currentTime.toFixed(1)} / ${state.duration.toFixed(1)} 秒`
  $('diagnostic').textContent = JSON.stringify(d, null, 2)
}, 500)
$('record').onclick = () => {
  samples.push(diagnostic())
  $('status').textContent = `已记录 ${samples.length} 次状态`
}
$('export').onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ samples, current: diagnostic() }, null, 2)], {
      type: 'application/json',
    }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'real-video-experiment.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
Object.assign(window, {
  realExperiment: {
    diagnostic,
    seek,
    openFile,
    pause: () => adapter?.pause(),
    play: () => adapter?.play(),
    rate: (rate: number) => {
      adapter?.setRate(rate)
    },
  },
})
window.addEventListener('beforeunload', () => adapter?.destroy())
