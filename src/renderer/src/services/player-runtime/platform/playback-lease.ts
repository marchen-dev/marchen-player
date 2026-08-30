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
): PlaybackSourceLease => {
  let released = false
  let seekOperation = Promise.resolve(descriptor)
  const lease: PlaybackSourceLease = {
    ...descriptor,
    release: () => {
      if (released) return
      released = true
      releaseResource()
    },
  }
  if (seekResource) {
    lease.seek = (logicalTime) => {
      seekOperation = seekOperation.then(async () => {
        if (released) throw new Error('播放源租约已经释放')
        const generation = lease.generation
        if (generation === undefined) throw new Error('兼容播放租约缺少 generation')
        const next = await seekResource(logicalTime, generation)
        Object.assign(lease, next)
        return next
      })
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
