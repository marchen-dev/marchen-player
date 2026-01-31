// renderer/components/FFmpegPlayer.tsx

import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { VideoMetadata } from './decoder'
import { VideoDecoder } from './decoder'

interface PlayerProps {
  src?: string
  onMetadataLoaded?: (metadata: VideoMetadata) => void
}

interface PerformanceStats {
  fps: number
  decodeTime: number
  imageDataTime: number
  putImageTime: number
  totalTime: number
}

export const FFmpegPlayer: FC<PlayerProps> = (props) => {
  const { src, onMetadataLoaded } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decoderRef = useRef<VideoDecoder | null>(null)
  const isPlayingRef = useRef(false)
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 性能统计 refs
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(performance.now())
  const perfStatsRef = useRef<PerformanceStats>({
    fps: 0,
    decodeTime: 0,
    imageDataTime: 0,
    putImageTime: 0,
    totalTime: 0,
  })

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [perfStats, setPerfStats] = useState<PerformanceStats>({
    fps: 0,
    decodeTime: 0,
    imageDataTime: 0,
    putImageTime: 0,
    totalTime: 0,
  })

  // 同步 ref
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // 初始化 decoder
  useEffect(() => {
    decoderRef.current = new VideoDecoder()
    return () => {
      decoderRef.current?.close()
    }
  }, [])

  // 加载视频
  useEffect(() => {
    if (!src || !decoderRef.current) return

    const loadVideo = async () => {
      try {
        setError(null)
        const meta = await decoderRef.current!.open(src, { forceSoftwareDecode: true })

        setMetadata(meta)
        setDuration(meta.duration)
        onMetadataLoaded?.(meta)

        if (canvasRef.current) {
          canvasRef.current.width = meta.width
          canvasRef.current.height = meta.height
        }

        const frame = decoderRef.current!.decodeFrame()
        if (frame && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')
          ctx?.putImageData(frame.imageData, 0, 0)
          setCurrentTime(frame.pts)
        }
      } catch (err) {
        console.error('Failed to open video:', err)
        setError(String(err))
      }
    }

    loadVideo()
  }, [src, onMetadataLoaded])

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (frameTimerRef.current) {
      clearTimeout(frameTimerRef.current)
      frameTimerRef.current = null
    }
  }, [])

  // 播放下一帧（带性能监控）
  const playNextFrame = useCallback((lastPts: number) => {
    if (!isPlayingRef.current || !decoderRef.current || !canvasRef.current) {
      return
    }

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    try {
      // ===== 性能测量开始 =====
      const t0 = performance.now()

      // 解码帧
      const frame = decoderRef.current.decodeFrameRaw()

      const t1 = performance.now()

      if (!frame) {
        setIsPlaying(false)
        return
      }

      // 创建 ImageData
      const imageData = new ImageData(
        new Uint8ClampedArray(frame.buffer),
        frame.width,
        frame.height
      )

      const t2 = performance.now()

      // 绘制到 canvas
      ctx.putImageData(imageData, 0, 0)

      const t3 = performance.now()

      // ===== 性能统计 =====
      frameCountRef.current++
      const now = performance.now()

      // 累计本次耗时
      perfStatsRef.current.decodeTime += t1 - t0
      perfStatsRef.current.imageDataTime += t2 - t1
      perfStatsRef.current.putImageTime += t3 - t2
      perfStatsRef.current.totalTime += t3 - t0

      // 每秒更新一次统计
      if (now - lastFpsTimeRef.current >= 1000) {
        const count = frameCountRef.current
        const stats: PerformanceStats = {
          fps: count,
          decodeTime: perfStatsRef.current.decodeTime / count,
          imageDataTime: perfStatsRef.current.imageDataTime / count,
          putImageTime: perfStatsRef.current.putImageTime / count,
          totalTime: perfStatsRef.current.totalTime / count,
        }

        setPerfStats(stats)
        // 重置计数器
        frameCountRef.current = 0
        lastFpsTimeRef.current = now
        perfStatsRef.current = {
          fps: 0,
          decodeTime: 0,
          imageDataTime: 0,
          putImageTime: 0,
          totalTime: 0,
        }
      }

      setCurrentTime(frame.pts)

      // 计算下一帧延迟
      const ptsDiff = frame.pts - lastPts
      const frameInterval = metadata?.frameRate ? 1000 / metadata.frameRate : 41.67
      const delay = ptsDiff > 0 && ptsDiff < 1 ? ptsDiff * 1000 : frameInterval

      // 补偿处理时间
      const processingTime = t3 - t0
      const adjustedDelay = Math.max(0, delay - processingTime)

      frameTimerRef.current = setTimeout(() => {
        playNextFrame(frame.pts)
      }, adjustedDelay)
    } catch (err) {
      console.error('Decode error:', err)
      setError(String(err))
      setIsPlaying(false)
    }
  }, [metadata?.frameRate])

  // 播放控制
  useEffect(() => {
    if (isPlaying) {
      // 重置性能统计
      frameCountRef.current = 0
      lastFpsTimeRef.current = performance.now()
      perfStatsRef.current = {
        fps: 0,
        decodeTime: 0,
        imageDataTime: 0,
        putImageTime: 0,
        totalTime: 0,
      }
      playNextFrame(currentTime)
    } else {
      stopPlayback()
    }

    return stopPlayback
  }, [isPlaying, playNextFrame, stopPlayback])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number.parseFloat(e.target.value)
    const wasPlaying = isPlaying

    if (wasPlaying) {
      setIsPlaying(false)
    }

    if (decoderRef.current?.seek(time)) {
      const frame = decoderRef.current.decodeFrame()
      if (frame && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        ctx?.putImageData(frame.imageData, 0, 0)
        setCurrentTime(frame.pts)
      }

      if (wasPlaying) {
        setTimeout(() => setIsPlaying(true), 50)
      }
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // 判断性能是否达标
  const targetFps = metadata?.frameRate ?? 24
  const fpsOk = perfStats.fps >= targetFps * 0.95 // 允许 5% 误差
  const isDropping = perfStats.fps > 0 && perfStats.fps < targetFps * 0.9

  return (
    <div className="video-player">
      <canvas ref={canvasRef} style={{ maxWidth: '100%', backgroundColor: '#000' }} />

      {error && (
        <div style={{ color: 'red', padding: '10px' }}>
          Error: {error}
        </div>
      )}

      <div className="controls" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
        <button onClick={handlePlayPause}>
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1 }}
        />

        <span style={{ minWidth: '100px' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* 视频信息 */}
      {metadata && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
          📹 {metadata.width}x{metadata.height} | {metadata.codecName} |{' '}
          目标: {metadata.frameRate.toFixed(2)} fps |{' '}
          {metadata.hwAccel ? `🎮 HW: ${metadata.hwDevice}` : '💻 Software'}
        </div>
      )}

      {/* 性能统计 */}
      {isPlaying && (
        <div
          style={{
            fontSize: '12px',
            padding: '8px',
            backgroundColor: isDropping ? '#fff3f3' : '#f5f5f5',
            borderRadius: '4px',
            fontFamily: 'monospace',
          }}
        >
          <div style={{ marginBottom: '4px' }}>
            <strong>⚡ 性能监控</strong>
            {isDropping && <span style={{ color: 'red', marginLeft: '10px' }}>⚠️ 掉帧!</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            <span>
              实际帧率:{' '}
              <strong style={{ color: fpsOk ? 'green' : 'red' }}>
                {perfStats.fps} fps
              </strong>
            </span>
            <span>总耗时: <strong>{perfStats.totalTime.toFixed(2)}ms</strong></span>
            <span>解码: <strong>{perfStats.decodeTime.toFixed(2)}ms</strong></span>
            <span>ImageData: <strong>{perfStats.imageDataTime.toFixed(2)}ms</strong></span>
            <span>putImage: <strong>{perfStats.putImageTime.toFixed(2)}ms</strong></span>
            <span>
              余量:{' '}
              <strong style={{ color: (1000 / targetFps - perfStats.totalTime) > 5 ? 'green' : 'orange' }}>
                {(1000 / targetFps - perfStats.totalTime).toFixed(2)}ms
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}