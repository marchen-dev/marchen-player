import type { AudioSample, VideoSample } from 'mediabunny'
import type { HevcDiagnostics } from '../hevc-decoder'
import type { CanvasReply, CanvasRequest } from './protocol'
import { registerAc3Decoder } from '@mediabunny/ac3'
import { registerDtsDecoder } from '@mediabunny/dts'
import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  CustomSource,
  Input,
  registerDecoder,
  VideoSampleSink,
} from 'mediabunny'
import { DecodeRate, observeVideoDecoder } from '../decode-rate'
import { createHevcDecoder } from '../hevc-decoder'
import { openRangeSource } from '../range-source'

registerAc3Decoder()
registerDtsDecoder()
let input: Input | undefined
let videoSink: VideoSampleSink | undefined
let audioSink: AudioSampleSink | undefined
let video: AsyncIterator<VideoSample> | undefined
let audio: AsyncIterator<AudioSample> | undefined
let generation = 0
let diagnostics: HevcDiagnostics | undefined
let positioning = Promise.resolve()
let selectedAudioTrackId: number | undefined
let decodedFrames = 0
let collectingDecodeRate = true
const decodeRate = new DecodeRate()
const onDecoded = () => {
  decodedFrames++
}
if (typeof VideoDecoder !== 'undefined')
  globalThis.VideoDecoder = observeVideoDecoder(VideoDecoder, onDecoded)
const send = (reply: CanvasReply, transfer: Transferable[] = []) =>
  globalThis.postMessage(reply, { transfer })

// 独立于取帧/渲染发布，缓冲中的提前解码也会计入；Worker 终止时自动清理。
setInterval(() => {
  send({
    id: 0,
    generation,
    type: 'decode-stats',
    fps: collectingDecodeRate ? decodeRate.sample(decodedFrames) : undefined,
  })
}, 250)

function seek(time: number, token: number) {
  const next = positioning
    .catch(() => {})
    .then(async () => {
      if (token !== generation) return
      const previousVideo = video
      const previousAudio = audio
      video = undefined
      audio = undefined
      await Promise.all([previousVideo?.return?.(), previousAudio?.return?.()])
      if (token !== generation) return
      decodeRate.reset()
      decodedFrames = 0
      video = videoSink?.samples(time)
      audio = audioSink?.samples(time)
    })
  positioning = next
  return next
}

globalThis.onmessage = async ({ data: request }: MessageEvent<CanvasRequest>) => {
  const token = { id: request.id, generation: request.generation }
  try {
    if (request.type === 'open') {
      generation = request.generation
      input?.dispose()
      const descriptor = request.source
      const source =
        descriptor.kind === 'file'
          ? new BlobSource(descriptor.file, { maxCacheSize: 32 * 1024 * 1024 })
          : await (async () => {
              const range = await openRangeSource(descriptor.url)
              return new CustomSource({
                getSize: () => range.size,
                read: (s, e) => range.read(s, e),
                maxCacheSize: 32 * 1024 * 1024,
              })
            })()
      input = new Input({ formats: ALL_FORMATS, source })
      const videoTrack = await input.getPrimaryVideoTrack()
      const audioTracks = request.videoOnly ? [] : await input.getAudioTracks()
      const audioTrack = request.videoOnly
        ? undefined
        : request.audioTrackId === undefined
          ? await input.getPrimaryAudioTrack()
          : audioTracks.find((track) => track.id === request.audioTrackId)
      if (!videoTrack) throw new Error('未找到可播放视频轨')
      if (request.audioTrackId !== undefined && !audioTrack) throw new Error('指定音轨不存在')
      const config = await videoTrack.getDecoderConfig()
      if (!config) throw new Error('视频编码不支持')
      const native =
        typeof VideoDecoder !== 'undefined' &&
        (await VideoDecoder.isConfigSupported(config)
          .then((r) => Boolean(r.supported))
          .catch(() => false))
      const software = request.forceSoftware || !native
      const threads = software && crossOriginIsolated ? 4 : 1
      if (software) {
        if ((await videoTrack.getCodec()) !== 'hevc') throw new Error('当前视频编码没有可用解码器')
        registerDecoder(
          createHevcDecoder({
            assetBase: request.assetBase,
            threads,
            shouldDecode: () => true,
            onDecoded,
            onDiagnostics: (value) => {
              diagnostics = value
            },
          }),
        )
      }
      selectedAudioTrackId = audioTrack?.id
      videoSink = new VideoSampleSink(videoTrack)
      audioSink = audioTrack ? new AudioSampleSink(audioTrack) : undefined
      send({
        ...token,
        type: 'ready',
        // 保留容器时间坐标；只跳过所有音视频轨之前的空区间，不重写字幕时间。
        startTime: Math.max(
          0,
          await input.getFirstTimestamp(
            (await input.getTracks()).filter(
              (track) => track.isVideoTrack() || track.isAudioTrack(),
            ),
          ),
        ),
        duration: (await input.getDurationFromMetadata()) ?? (await input.computeDuration()),
        width: await videoTrack.getDisplayWidth(),
        height: await videoTrack.getDisplayHeight(),
        videoCodec: await videoTrack.getCodec(),
        hasAudio: Boolean(audioTrack),
        selectedAudioTrackId,
        audioTracks: await Promise.all(
          audioTracks.map(async (track) => ({
            id: track.id,
            label: (await track.getName()) || `音轨 ${track.number}`,
            language: await track.getLanguageCode(),
            codec: await track.getCodec(),
            channels: await track.getNumberOfChannels(),
            default: (await track.getDisposition()).default,
          })),
        ),
        backend: software ? 'hevc-wasm' : 'webcodecs',
        threads: software ? threads : 0,
      })
    } else if (request.type === 'seek') {
      generation = request.generation
      collectingDecodeRate = false
      if (request.audioTrackId !== undefined && request.audioTrackId !== selectedAudioTrackId) {
        const track = (await input?.getAudioTracks())?.find(
          (track) => track.id === request.audioTrackId,
        )
        if (!track) throw new Error('指定音轨不存在')
        if (generation !== request.generation) return
        audioSink = new AudioSampleSink(track)
        selectedAudioTrackId = track.id
      }
      if (generation !== request.generation) return
      await seek(request.time, request.generation)
      if (generation === request.generation) {
        collectingDecodeRate = true
        send({ ...token, type: 'seeked' })
      }
    } else if (request.type === 'video') {
      const sample = (await video?.next())?.value
      if (generation !== request.generation) {
        sample?.close()
        return
      }
      if (!sample) {
        send({ ...token, type: 'video', frame: null, timestamp: 0, duration: 0, rotation: 0 })
        return
      }
      try {
        const frame = sample.toVideoFrame()
        send(
          {
            ...token,
            type: 'video',
            frame,
            rotation: sample.rotation,
            diagnostics,
            timestamp: sample.timestamp,
            duration: sample.duration,
          },
          [frame],
        )
      } finally {
        sample.close()
      }
    } else if (request.type === 'audio') {
      const sample = (await audio?.next())?.value
      if (generation !== request.generation) {
        sample?.close()
        return
      }
      if (!sample) {
        send({ ...token, type: 'audio', planes: [], sampleRate: 0, timestamp: 0, duration: 0 })
        return
      }
      try {
        const planes = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const plane = new Float32Array(sample.numberOfFrames)
          sample.copyTo(plane, { format: 'f32-planar', planeIndex })
          return plane
        })
        send(
          {
            ...token,
            type: 'audio',
            planes,
            sampleRate: sample.sampleRate,
            timestamp: sample.timestamp,
            duration: sample.duration,
          },
          planes.map((p) => p.buffer),
        )
      } finally {
        sample.close()
      }
    }
  } catch (error) {
    send({
      ...token,
      type: 'error',
      message: error instanceof Error ? error.message : '媒体 Worker 失败',
    })
  }
}
