import type { SoundTouchNode } from '@soundtouchjs/audio-worklet'

const delays = new Map<string, Promise<number>>()
const processorUrl = () =>
  new URL(
    `${import.meta.env.BASE_URL}audio/soundtouch/2.1.1/processor.js`,
    globalThis.location.href,
  ).href

/** Worklet 限定立体声；Web Audio 按 speakers 规则混合中心/环绕声道，避免只取前两路丢失对白。 */
export async function createAudioStretch(context: AudioContext, rate: number) {
  const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet')
  const url = processorUrl()
  await SoundTouchNode.register(context, url)
  const node = new SoundTouchNode({ context, outputChannelCount: 2 })
  node.channelCount = 2
  node.channelCountMode = 'explicit'
  node.channelInterpretation = 'speakers'
  node.playbackRate.value = rate
  node.setStretchParameters({ sequenceMs: 30, seekWindowMs: 10, overlapMs: 8 })
  try {
    return { node, delay: await measureDelay(rate, context.sampleRate, url) }
  } catch (error) {
    closeAudioStretch(node)
    throw error
  }
}
export function closeAudioStretch(node: SoundTouchNode | undefined) {
  node?.disconnect()
  node?.port.close()
}

/** 用独立离线图测启动延迟，不能把设备 outputLatency 当作 DSP 的缓冲延迟。 */
function measureDelay(rate: number, sampleRate: number, url: string) {
  const key = `${rate}:${sampleRate}`
  let pending = delays.get(key)
  if (!pending) {
    pending = (async () => {
      const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet')
      const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * 0.5), sampleRate)
      await SoundTouchNode.register(offline, url)
      const node = new SoundTouchNode({ context: offline })
      node.playbackRate.value = rate
      node.setStretchParameters({ sequenceMs: 30, seekWindowMs: 10, overlapMs: 8 })
      node.connect(offline.destination)
      const source = offline.createBufferSource()
      const buffer = offline.createBuffer(2, Math.ceil(sampleRate * 0.4 * rate), sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < data.length; i++)
          data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
      }
      source.buffer = buffer
      source.playbackRate.value = rate
      source.connect(node)
      source.start(0.02)
      try {
        const rendered = await offline.startRendering()
        const index = rendered.getChannelData(0).findIndex((value) => Math.abs(value) > 0.01)
        if (index < 0) throw new Error('音频倍速校准未输出采样')
        return Math.max(0, index / sampleRate - 0.02)
      } finally {
        source.disconnect()
        closeAudioStretch(node)
      }
    })().catch((error) => {
      delays.delete(key)
      throw error
    })
    delays.set(key, pending)
  }
  return pending
}
