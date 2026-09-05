import type {
  MediaCompatError,
  PlaybackSourceLease,
  PlaybackSourceLeaseDescriptor,
} from '@marchen/shared/media'

/** Renderer 只给可序列化 descriptor 加上幂等释放能力，不解释底层传输。 */
export const createPlaybackSourceLease = (
  descriptor: PlaybackSourceLeaseDescriptor,
  releaseResource: () => void,
  seekResource?: (
    logicalTime: number,
    expectedGeneration: number,
  ) => Promise<PlaybackSourceLeaseDescriptor>,
  acknowledgeResource?: (
    phase: 'attaching' | 'playable' | 'failed',
    generation: number,
    error?: MediaCompatError,
  ) => Promise<void>,
  reportPlayback?: (position: number) => void,
): PlaybackSourceLease => {
  let released = false
  let seekOperation = Promise.resolve(descriptor)
  let latestSeek = 0
  let currentDescriptor = descriptor
  const lease: PlaybackSourceLease = {
    ...descriptor,
    release: () => {
      if (released) return
      released = true
      releaseResource()
    },
  }
  if (reportPlayback && descriptor.hlsSessionMode === 'stable-vod')
    lease.reportPlayback = (position) => {
      if (!released) reportPlayback(position)
    }
  if (seekResource && descriptor.hlsSessionMode !== 'stable-vod') {
    lease.seek = (logicalTime) => {
      const request = ++latestSeek
      const run = async () => {
        if (released) throw new Error('播放源租约已经释放')
        // 已启动的请求保持串行完成；尚未启动的过期目标不再创建 generation。
        if (request !== latestSeek) return currentDescriptor
        const generation = lease.generation
        if (generation === undefined) throw new Error('兼容播放租约缺少 generation')
        const next = await seekResource(logicalTime, generation)
        if (released) throw new Error('播放源租约已经释放')
        Object.assign(lease, next)
        currentDescriptor = next
        return next
      }
      // 单次失败只拒绝该调用；后续用户重试仍要进入资源层核对会话。
      seekOperation = seekOperation.then(run, run)
      return seekOperation
    }
  }
  if (acknowledgeResource) {
    const acknowledge = (phase: 'attaching' | 'playable' | 'failed', error?: MediaCompatError) => {
      if (released) return Promise.reject(new Error('播放源租约已经释放'))
      if (lease.generation === undefined)
        return Promise.reject(new Error('兼容播放租约缺少 generation'))
      return acknowledgeResource(phase, lease.generation, error)
    }
    lease.markAttaching = () => acknowledge('attaching')
    lease.markPlayable = () => acknowledge('playable')
    lease.markFailed = (error) => acknowledge('failed', error)
  }
  return lease
}
