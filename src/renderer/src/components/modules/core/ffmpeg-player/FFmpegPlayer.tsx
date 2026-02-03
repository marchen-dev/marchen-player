// renderer/components/FFmpegPlayer.tsx
import type { WrappedAudioBuffer, WrappedCanvas } from 'mediabunny'
import { ALL_FORMATS, AudioBufferSink, CanvasSink, Input, UrlSource } from 'mediabunny'
import type { FC } from 'react'
import { useEffect, useRef } from 'react'

interface PlayerProps {
  src: string
}

export const FFmpegPlayer: FC<PlayerProps> = ({ src }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const totalDurationRef = useRef<number>(0)
  const gainNodeRef = useRef<GainNode | null>(null)

  const audioStartTimeRef = useRef<number>(0)
  const playbackTimeAtStartRef = useRef<number>(0)

  const videoIteratorRef = useRef<AsyncGenerator<WrappedCanvas> | null>(null)
  const audioIteratorRef = useRef<AsyncGenerator<WrappedAudioBuffer> | null>(null)

  const nextFrameRef = useRef<WrappedCanvas | null>(null)
  const playerRef = useRef<boolean>(false)

  const queuedAudioNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set())

  useEffect(() => {
    playVideo()
  }, [src])

  const getPlaybackTime = () => {
    if (playerRef.current && audioCtxRef.current) {
      return (
        audioCtxRef.current.currentTime - audioStartTimeRef.current + playbackTimeAtStartRef.current
      )
    }
    return playbackTimeAtStartRef.current
  }

  const playVideo = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(src),
    })

    const videoTrack = await input.getPrimaryVideoTrack()
    const audioTrack = await input.getPrimaryAudioTrack()

    if (!videoTrack) {
      return
    }

    if (!(await videoTrack.canDecode())) return

    canvas.width = videoTrack.displayWidth
    canvas.height = videoTrack.displayHeight

    totalDurationRef.current = await input.computeDuration()
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const audioCtx = new AudioContextClass({
      sampleRate: audioTrack?.sampleRate,
    })
    audioCtxRef.current = audioCtx

    const gainNode = audioCtx.createGain()
    gainNode.connect(audioCtx.destination)
    gainNode.gain.value = 1
    gainNodeRef.current = gainNode

    const videoSink = new CanvasSink(videoTrack, { poolSize: 2 })
    const audioSink =
      audioTrack && (await audioTrack.canDecode()) ? new AudioBufferSink(audioTrack) : null

    videoIteratorRef.current = videoSink.canvases(0)
    const firstFrame = (await videoIteratorRef.current.next()).value ?? null
    nextFrameRef.current = (await videoIteratorRef.current.next()).value ?? null
    if (firstFrame) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(firstFrame.canvas, 0, 0)
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    playerRef.current = true
    audioStartTimeRef.current = audioCtx.currentTime
    if (audioSink) {
      audioIteratorRef.current = audioSink.buffers(0)
      runAudioIterator()
    }

    const render = async () => {
      if (!playerRef.current) return

      const playbackTime = getPlaybackTime()

      if (playbackTime >= totalDurationRef.current) {
        playerRef.current = false
        return
      }

      if (nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(nextFrameRef.current.canvas, 0, 0)
        nextFrameRef.current = null
        updateNextFrame(playbackTime, ctx, canvas)
      }
      requestAnimationFrame(render)
    }

    render()
  }

  const runAudioIterator = async () => {
    const audioCtx = audioCtxRef.current!
    const gainNode = gainNodeRef.current!
    const iterator = audioIteratorRef.current!

    for await (const { buffer, timestamp } of iterator) {
      if (!playerRef.current) break

      const node = audioCtx.createBufferSource()
      node.buffer = buffer
      node.connect(gainNode)
      const startTimeStamp = audioStartTimeRef.current + timestamp - playbackTimeAtStartRef.current
      if (startTimeStamp >= audioCtx.currentTime) {
        node.start(startTimeStamp)
      } else {
        const offset = audioCtx.currentTime - startTimeStamp
        if (offset < buffer.duration) {
          node.start(audioCtx.currentTime, offset)
        }
      }

      queuedAudioNodesRef.current.add(node)
      node.onended = () => {
        queuedAudioNodesRef.current.delete(node)
      }

      if (timestamp - getPlaybackTime() >= 1) {
        await new Promise<void>((resolve) => {
          const id = setInterval(() => {
            if (timestamp - getPlaybackTime() < 1) {
              clearInterval(id)
              resolve()
            }
          }, 100)
        })
      }
    }
  }

  const updateNextFrame = async (
    playbackTime: number,
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ) => {
    while (true) {
      const result = await videoIteratorRef.current?.next()
      const newFrame = result?.value ?? null
      if (!newFrame) {
        break
      }
      if (newFrame.timestamp <= playbackTime) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(newFrame.canvas, 0, 0)
      } else {
        nextFrameRef.current = newFrame
        break
      }
    }
  }

  return <canvas ref={canvasRef} style={{ maxWidth: '100%', background: '#000' }} />
}
