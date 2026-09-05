import type { PlaybackMethod } from '@marchen/shared/media'

const METHOD_ORDER: Record<PlaybackMethod, number> = {
  'direct-play': 0,
  'direct-stream': 1,
  transcode: 2,
}

/** logical source 级别的单向 attempt 链；普通 seek 不创建新 attempt。 */
export class LogicalPlaybackAttemptChain {
  #methods: PlaybackMethod[]

  constructor(initial: PlaybackMethod | readonly PlaybackMethod[]) {
    const methods = typeof initial === 'string' ? [initial] : [...initial]
    if (methods.length === 0 || !this.#isStrictlyForward(methods)) {
      throw new Error('Playback attempt chain 必须是非空且严格单向的')
    }
    this.#methods = methods
  }

  get methods(): PlaybackMethod[] {
    return [...this.#methods]
  }

  get current(): PlaybackMethod {
    return this.#methods.at(-1)!
  }

  advance(target: PlaybackMethod): PlaybackMethod[] {
    if (METHOD_ORDER[target] <= METHOD_ORDER[this.current]) {
      throw new Error(`Playback attempt 不能从 ${this.current} 回退或重复到 ${target}`)
    }
    this.#methods = [...this.#methods, target]
    return this.methods
  }

  #isStrictlyForward(methods: readonly PlaybackMethod[]): boolean {
    return methods.every(
      (method, index) => index === 0 || METHOD_ORDER[method] > METHOD_ORDER[methods[index - 1]!],
    )
  }
}

export const playbackMethodForMode = (
  mode: 'direct' | 'remux' | 'transcode-audio' | 'transcode-video',
): PlaybackMethod => {
  if (mode === 'direct') return 'direct-play'
  if (mode === 'transcode-video') return 'transcode'
  return 'direct-stream'
}
