import type { MediaAudioTrack } from '@marchen/playback-core'
import type { HevcDiagnostics } from '../hevc-decoder'

export type CanvasSource = { kind: 'file'; file: File } | { kind: 'url'; url: string }
export type CanvasRequest = { id: number; generation: number } & (
  | {
      type: 'open'
      source: CanvasSource
      assetBase: string
      forceSoftware?: boolean
      videoOnly?: boolean
      audioTrackId?: number
    }
  | { type: 'seek'; time: number; audioTrackId?: number }
  | { type: 'video' }
  | { type: 'audio' }
)
export type CanvasReply = { id: number; generation: number } & (
  | { type: 'decode-stats'; fps?: number }
  | {
      type: 'ready'
      startTime: number
      duration: number
      width: number
      height: number
      videoCodec: string | null
      hasAudio: boolean
      audioTracks: MediaAudioTrack[]
      selectedAudioTrackId?: number
      backend: 'webcodecs' | 'hevc-wasm'
      threads: number
    }
  | {
      type: 'video'
      frame: VideoFrame | null
      timestamp: number
      duration: number
      rotation: number
      diagnostics?: HevcDiagnostics
    }
  | {
      type: 'audio'
      planes: Float32Array<ArrayBuffer>[]
      sampleRate: number
      timestamp: number
      duration: number
    }
  | { type: 'seeked' }
  | { type: 'error'; message: string }
)
