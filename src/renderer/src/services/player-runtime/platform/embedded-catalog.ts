import type { DurableMediaSource } from '@marchen/shared/media'
import type { EmbeddedSubtitleTrack } from '../../media/subtitles/matroska'
import type { ResolvedSubtitleTrack, SubtitleTrackDescriptor } from './ports'
import { reportUnsupportedSubtitleTracks } from '@renderer/services/telemetry/subtitles'
import { measureSubtitleRead } from '../../media/subtitles/diagnostics'
import { MatroskaSubtitles } from '../../media/subtitles/matroska'
import { PgsSubtitleSession } from '../../media/subtitles/pgs/session'
import { resolveEmbeddedSubtitle } from '../../media/subtitles/resolve'
import { supportsEmbeddedSubtitles } from '../subtitles/source-policy'
import { openPlaybackResource } from './media-resource'

/** 两端使用相同的容器轨道编号；每次借用独立读取租约，不释放播放中的来源。 */
export async function listEmbeddedSubtitles(
  source: DurableMediaSource,
  signal = new AbortController().signal,
): Promise<SubtitleTrackDescriptor[]> {
  if (!supportsEmbeddedSubtitles(source) || !/\.(?:mkv|mk3d|webm)$/i.test(source.name)) return []
  const resource = await openPlaybackResource(source, signal)
  const lease = resource.acquire()
  try {
    const reader = await measureSubtitleRead('catalog', lease.source, false, (measured) =>
      MatroskaSubtitles.open(measured, signal),
    )
    try {
      reportUnsupportedSubtitleTracks(source, reader.tracks)
    } catch {
      // 统计失败不影响字幕列表
    }
    return reader.tracks.map((track) => ({
      id: `embedded:${track.number}`,
      title: (track.title || `内嵌字幕 ${track.number}`) + unsupportedSuffix(track),
      language: track.language,
      origin: 'embedded',
      embedded: { number: track.number, uid: track.uid, codec: track.codec },
      supported: track.supported,
      kind: track.kind,
    }))
  } finally {
    lease.release()
    resource.close()
  }
}

/** 图片字幕说明原因，避免用户以为是故障；其他不支持的轨道保持原文案 */
function unsupportedSuffix(track: EmbeddedSubtitleTrack) {
  if (track.supported) return ''
  if (track.unsupportedCode === 'bitmap_codec') return '（图片字幕，暂不支持）'
  if (track.unsupportedCode === 'missing_index') return '（图片字幕，文件缺少索引）'
  return '（暂不支持）'
}

export async function resolveEmbeddedTrack(
  source: DurableMediaSource,
  track: SubtitleTrackDescriptor,
  signal = new AbortController().signal,
): Promise<ResolvedSubtitleTrack> {
  if (!supportsEmbeddedSubtitles(source)) throw new Error('远程视频暂不支持内嵌字幕')
  if (track.kind === 'bitmap') return resolveBitmapTrack(source, track, signal)
  const resource = await openPlaybackResource(source, signal)
  const lease = resource.acquire()
  try {
    const number = track.embedded?.number ?? Number(track.id.replace('embedded:', ''))
    const resolved = await resolveEmbeddedSubtitle(lease.source, number, signal, track.embedded)
    return { ...track, kind: 'text', ...resolved }
  } finally {
    lease.release()
    resource.close()
  }
}

/**
 * 位图字幕：读取租约交给会话长期持有，关闭字幕时才释放。
 * 请求信号只约束打开阶段；打开完成后与之脱钩，避免后续换轨请求的取消误关正在显示的会话。
 */
async function resolveBitmapTrack(
  source: DurableMediaSource,
  track: SubtitleTrackDescriptor,
  signal: AbortSignal,
): Promise<ResolvedSubtitleTrack> {
  if (!track.embedded) throw new Error('图片字幕缺少轨道信息')
  const lifetime = new AbortController()
  const forward = () => lifetime.abort(signal.reason)
  signal.addEventListener('abort', forward, { once: true })
  if (signal.aborted) forward()
  try {
    const resource = await openPlaybackResource(source, lifetime.signal)
    let compat: ReturnType<typeof resource.compat> | undefined
    let released = false
    const release = () => {
      if (released) return
      released = true
      compat?.release()
      resource.close()
    }
    try {
      compat = resource.compat()
      const hdrHint = await resource.metadata.isHdrVideo()
      signal.throwIfAborted()
      const session = await PgsSubtitleSession.open(compat.source, track.embedded, {
        hdrHint,
        release,
        signal,
      })
      return { ...track, kind: 'bitmap', session, release: () => void session.close() }
    } catch (error) {
      // 会话打开失败时 PgsSubtitleSession 已释放过；release 幂等，这里兜底其余失败
      release()
      throw error
    }
  } finally {
    signal.removeEventListener('abort', forward)
  }
}
