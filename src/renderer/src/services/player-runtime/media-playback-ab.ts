import type { PlannerShadowComparison } from './planner-migration'

export interface PlaybackAbEnvironment {
  DEV: boolean
  VITE_MEDIA_COMPAT_PLANNER?: string
  VITE_MEDIA_GATEWAY_V2?: string
}

export interface TransportAbSample {
  transport: 'v1-generation' | 'v2-stable-vod'
  outcome: 'playable' | 'failed'
  firstFrameMs?: number
  seekResumeMs?: number
  processingSpeed?: number
  cacheBytes?: number
}

export interface PlaybackAbSnapshot {
  planner: {
    samples: number
    differences: number
    differingFields: Record<string, number>
  }
  transports: Record<TransportAbSample['transport'], TransportAbSample[]>
}

export const resolvePlaybackAbFlags = (environment: PlaybackAbEnvironment) => ({
  plannerShadow: environment.DEV && environment.VITE_MEDIA_COMPAT_PLANNER === 'shadow',
  dynamicHlsV2: environment.DEV && environment.VITE_MEDIA_GATEWAY_V2 === '1',
})

/** A/B 只保留枚举和数值，不接收媒体身份、URL、token 或路径。 */
export class MediaPlaybackAbRecorder {
  #plannerSamples = 0
  #plannerDifferences = 0
  readonly #differingFields = new Map<string, number>()
  readonly #transports: PlaybackAbSnapshot['transports'] = {
    'v1-generation': [],
    'v2-stable-vod': [],
  }

  recordPlanner(comparison: PlannerShadowComparison): void {
    this.#plannerSamples += 1
    if (!comparison.equal) this.#plannerDifferences += 1
    for (const field of comparison.differingFields) {
      this.#differingFields.set(field, (this.#differingFields.get(field) ?? 0) + 1)
    }
  }

  recordTransport(sample: TransportAbSample): void {
    this.#transports[sample.transport].push({ ...sample })
  }

  snapshot(): PlaybackAbSnapshot {
    return {
      planner: {
        samples: this.#plannerSamples,
        differences: this.#plannerDifferences,
        differingFields: Object.fromEntries(this.#differingFields),
      },
      transports: {
        'v1-generation': this.#transports['v1-generation'].map((sample) => ({ ...sample })),
        'v2-stable-vod': this.#transports['v2-stable-vod'].map((sample) => ({ ...sample })),
      },
    }
  }
}

export const mediaPlaybackAbRecorder = new MediaPlaybackAbRecorder()
