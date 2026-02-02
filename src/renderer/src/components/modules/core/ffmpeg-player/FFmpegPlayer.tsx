// renderer/components/FFmpegPlayer.tsx

import * as MP4Box from 'mp4box'
import type { FC } from 'react'
import { useEffect, useRef } from 'react'

import type { VideoTrackInfo } from './mp4-demuxer'

interface PlayerProps {
  src: string
  onMetadataLoaded?: (metadata: VideoTrackInfo) => void
}

export const FFmpegPlayer: FC<PlayerProps> = (props) => {
  const playerRef = useRef<HTMLCanvasElement | null>(null)

  const framesQueue = useRef<VideoFrame[]>([])
  const animationFrameId = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    abortControllerRef.current = new AbortController()
    const mp4boxFile = MP4Box.createFile()
    initMP4Box(mp4boxFile)
    loadVideo(props.src, mp4boxFile)
    renderLoop()
  }, [])

  const initMP4Box = (mp4boxFile: MP4Box.ISOFile) => {
    const decoder = new VideoDecoder({
      output: handleFrame,
      error: (e) => console.error('Decoder error:', e),
    })

    mp4boxFile.onReady = (info) => {
      const track = info.videoTracks[0]
      const description = getExtradata(mp4boxFile, track)
      decoder.configure({
        codec: track.codec,
        codedWidth: track.video!.width,
        codedHeight: track.video!.height,
        description,
      })
      mp4boxFile.setExtractionOptions(track.id)
      mp4boxFile.start()
    }
    mp4boxFile.onError = (e) => {
      console.error('MP4Box error:', e)
    }
    mp4boxFile.onSamples = (trackId, ref, samples) => {
      for (const sample of samples) {
        const type = sample.is_sync ? 'key' : 'delta'
        const chunk = new EncodedVideoChunk({
          type,
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data as any,
        })
        decoder.decode(chunk)
      }
    }
  }

  const renderLoop = () => {
    const frame = framesQueue.current[0]
    if (frame) {
      if (!isPlayingRef.current) {
        startTimeRef.current = performance.now()
        isPlayingRef.current = true
      }
      const elapsed = performance.now() - startTimeRef.current
      const frameTime = frame.timestamp / 1000 // 转换为毫秒
      if (elapsed >= frameTime) {
        framesQueue.current.shift()
        const canvas = playerRef.current
        const ctx = canvas?.getContext('2d')
        if (
          canvas &&
          (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight)
        ) {
          canvas.width = frame.displayWidth
          canvas.height = frame.displayHeight
        }
        ctx?.drawImage(frame, 0, 0, canvas!.width, canvas!.height)
        frame.close()
      }
    }
    animationFrameId.current = requestAnimationFrame(renderLoop)
  }
  const loadVideo = async (url: string, mp4boxFile: MP4Box.ISOFile) => {
    try {
      const response = await fetch(url, { signal: abortControllerRef.current?.signal })
      const reader = response.body!.getReader()
      let offset = 0
      while (true) {
        if (framesQueue.current.length > 100 || framesQueue.current.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 20))
          continue
        }
        const { done, value } = await reader.read()
        if (done) {
          mp4boxFile.flush()
          break
        }
        const chunkBuffer = value.buffer as ArrayBuffer & { fileStart: number }
        chunkBuffer.fileStart = offset
        mp4boxFile.appendBuffer(chunkBuffer)
        offset += value.byteLength
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.error('Fetch aborted')
      } else {
        console.error('Load video error:', e)
      }
    }
  }

  const getExtradata = (
    mp4boxFile: MP4Box.ISOFile,
    track: MP4Box.Track,
  ): Uint8Array | undefined => {
    const trak = mp4boxFile.getTrackById(track.id)
    const entry = trak.mdia.minf.stbl.stsd.entries[0] as any
    const avcC = entry.avcC || entry.hvcC

    const stream = new MP4Box.DataStream(undefined, 0, (MP4Box.DataStream as any).BIG_ENDIAN)
    avcC.write(stream)
    return new Uint8Array(stream.buffer.slice(8))
  }

  const handleFrame = (frame) => {
    framesQueue.current.push(frame)
    // const canvas = playerRef.current
    // if (!canvas) {
    //   frame.close()
    //   return
    // }
    // const ctx = canvas.getContext('2d')
    // ctx?.drawImage(frame, 0, 0)
    // frame.close()
  }

  return <canvas style={{ border: '1px solid black', maxWidth: '100%' }} ref={playerRef} />
}
