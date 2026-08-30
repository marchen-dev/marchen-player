import type { ErrorContext } from '../contracts'

import type { OutboxItem, OutboxStorage } from '../outbox'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureTelemetry,
  createCompositeTelemetryClient,
  createNoopTelemetryClient,
  telemetry,
} from '../client'
import { createTelemetryContextStore } from '../context'
import { captureExceptionOnce } from '../error-dedupe'
import { configureFeatureFlagReader, getFeatureFlag } from '../flags'
import { getOrCreateWebInstallId, resetWebInstallId } from '../identity'
import { captureStablePageView, resetPageViewStateForTest } from '../navigation'
import { reportOperationalError } from '../operational-errors'
import { OUTBOX_MAX_AGE_MS, OUTBOX_MAX_ITEMS, TelemetryOutbox } from '../outbox'
import { createReactRootErrorHandlers } from '../react-errors'
import { sanitizeTelemetryString, sanitizeTelemetryValue } from '../sanitize'
import { isNoisyGatewayMediaRequest } from '../sentry/options'
import { installStableRouterTracing, normalizeTelemetryRoute } from '../sentry/router-tracing'

const context = () => ({
  release: 'Marchen@1.0.0+abc',
  dist: 'web',
  version: '1.0.0',
  commit: 'abc',
  environment: 'development' as const,
  app_target: 'web' as const,
  runtime: 'renderer' as const,
  platform: 'darwin',
  arch: 'arm64',
  app_session_id: 'app-session',
})

afterEach(() => {
  configureTelemetry({ client: createNoopTelemetryClient(), contextProvider: context })
  vi.restoreAllMocks()
  resetPageViewStateForTest()
  configureFeatureFlagReader()
})

describe('telemetry facade', () => {
  it('adds common context to typed events', () => {
    const capture = vi.fn()
    configureTelemetry({
      contextProvider: context,
      client: { ...createNoopTelemetryClient(), capture },
    })

    telemetry.capture('page_viewed', { route: '/player' })

    expect(capture).toHaveBeenCalledWith(
      'page_viewed',
      expect.objectContaining({ route: '/player', release: 'Marchen@1.0.0+abc' }),
    )
  })

  it('keeps explicit structured logs separate from exceptions', () => {
    const log = vi.fn()
    const captureException = vi.fn()
    configureTelemetry({
      contextProvider: context,
      client: { ...createNoopTelemetryClient(), log, captureException },
    })

    telemetry.log({ level: 'warning', message: '已降级继续播放', data: { mode: 'direct' } })

    expect(log).toHaveBeenCalledOnce()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('continues business work when a client span fails to initialize', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = vi.fn(() => 'done')
    configureTelemetry({
      contextProvider: context,
      client: {
        ...createNoopTelemetryClient(),
        startSpan: () => {
          throw new Error('sdk unavailable')
        },
      },
    })

    expect(telemetry.startSpan({ name: 'load', op: 'test' }, run)).toBe('done')
    expect(run).toHaveBeenCalledOnce()
  })

  it('lets the tracing owner create a span and executes business work once', () => {
    const run = vi.fn(() => 'done')
    const startSpan = vi.fn()
    const owner = createNoopTelemetryClient()
    owner.startSpan = (span, callback) => {
      startSpan(span)
      return callback()
    }
    const composite = createCompositeTelemetryClient([owner, createNoopTelemetryClient()])

    expect(composite.startSpan({ name: 'prepare', op: 'player.prepare' }, run)).toBe('done')
    expect(startSpan).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('operational error mapping', () => {
  it('uses stable fingerprints and keeps expected cancellation out of issues', () => {
    const captureException = vi.fn()
    const log = vi.fn()
    configureTelemetry({
      contextProvider: context,
      client: { ...createNoopTelemetryClient(), captureException, log },
    })

    reportOperationalError('gateway', 'seek', {
      code: 'cancelled',
      message: 'seek cancelled',
    })
    reportOperationalError(
      'player',
      'load',
      Object.assign(new Error('decode failed'), { code: 'decode' }),
    )

    expect(log).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        errorCode: 'PLAYER_DECODE',
        fingerprint: ['operational', 'player', 'PLAYER_DECODE'],
      }),
    )
  })
})

describe('react root error classification', () => {
  it('separates uncaught, caught and recoverable mechanisms', () => {
    const capture = vi.fn<(error: unknown, context: ErrorContext) => string | undefined>(
      () => 'event-id',
    )
    const handlers = createReactRootErrorHandlers(capture)
    const info = { componentStack: '\n at Test' }

    handlers.onUncaughtError(new Error('uncaught'), info)
    handlers.onCaughtError(new Error('caught'), info)
    handlers.onRecoverableError(new Error('recoverable'), info)

    expect(capture.mock.calls.map(([, value]) => value)).toEqual([
      expect.objectContaining({ handled: false, mechanism: 'react.uncaught', level: 'fatal' }),
      expect.objectContaining({ handled: true, mechanism: 'react.caught', level: 'error' }),
      expect.objectContaining({
        handled: true,
        mechanism: 'react.recoverable',
        level: 'warning',
      }),
    ])
  })

  it('captures the same React/route error object only once', () => {
    const capture = vi.fn<(error: unknown, context: ErrorContext) => string | undefined>(
      () => 'event-id',
    )
    const error = new Error('same error')

    captureExceptionOnce(error, { mechanism: 'react.caught' }, capture)
    captureExceptionOnce(error, { mechanism: 'react-router.error' }, capture)

    expect(capture).toHaveBeenCalledOnce()
  })
})

describe('telemetry context', () => {
  it('keeps app session stable and updates identity/playback context', () => {
    const store = createTelemetryContextStore({
      runtime: 'renderer',
      platform: 'darwin',
      arch: 'arm64',
      appSessionId: 'app-session',
      build: {
        target: 'electron',
        release: 'release',
        dist: 'darwin-arm64',
        commit: 'abc',
        version: '1.0.0',
        environment: 'production',
      },
    })

    store.setInstallId('install')
    store.setPlaybackSessionId('playback')

    expect(store.get()).toMatchObject({
      install_id: 'install',
      app_session_id: 'app-session',
      playback_session_id: 'playback',
      app_target: 'electron',
    })
  })

  it('creates a new app session for every store', () => {
    const options = { runtime: 'renderer' as const, platform: 'web', arch: 'browser' }
    expect(createTelemetryContextStore(options).appSessionId).not.toBe(
      createTelemetryContextStore(options).appSessionId,
    )
  })
})

describe('stable router tracing', () => {
  it('uses stable route names for HashRouter page loads and navigations', () => {
    let listener: ((state: { location: { pathname: string } }) => void) | undefined
    const pageLoad = vi.fn()
    const navigation = vi.fn()
    const router = {
      state: { location: { pathname: '/' } },
      subscribe(callback: typeof listener) {
        listener = callback
        return () => {}
      },
    }

    installStableRouterTracing(router, { pageLoad, navigation })
    listener?.({ location: { pathname: '/library' } })
    listener?.({ location: { pathname: '/library' } })

    expect(pageLoad).toHaveBeenCalledWith('/player')
    expect(navigation).toHaveBeenCalledOnce()
    expect(navigation).toHaveBeenCalledWith('/library')
    expect(normalizeTelemetryRoute('/unexpected/path')).toBe('/unknown')
  })
})

describe('stable page views', () => {
  it('emits one initial page view and suppresses duplicate stable routes', () => {
    const capture = vi.fn()
    configureTelemetry({
      contextProvider: context,
      client: { ...createNoopTelemetryClient(), capture },
    })

    expect(captureStablePageView('/player')).toBe(true)
    expect(captureStablePageView('/player')).toBe(false)
    expect(captureStablePageView('/settings/general')).toBe(true)

    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenLastCalledWith(
      'page_viewed',
      expect.objectContaining({ route: '/settings/general', previous_route: '/player' }),
    )
  })
})

describe('non-critical feature flags', () => {
  it('falls back locally when the provider is missing or throws', () => {
    expect(getFeatureFlag('player-control-hints')).toBe(true)
    configureFeatureFlagReader(() => {
      throw new Error('offline')
    })
    expect(getFeatureFlag('compact-library-cards')).toBe(false)
    configureFeatureFlagReader(() => 'variant-b')
    expect(getFeatureFlag('settings-ai-badge')).toBe('variant-b')
  })
})

describe('critical event outbox', () => {
  const memoryStorage = () => {
    const values = new Map<string, OutboxItem>()
    const storage: OutboxStorage = {
      list: async () => [...values.values()],
      put: async (item) => void values.set(item.id, item),
      delete: async (id) => void values.delete(id),
      clear: async () => void values.clear(),
    }
    return { storage, values }
  }

  it('adds an insert id, retries without duplication and clears after success', async () => {
    let now = 1_000
    const { storage, values } = memoryStorage()
    const outbox = new TelemetryOutbox(storage, () => now)
    const item = await outbox.enqueue('app_session_started', {}, crypto.randomUUID())
    const send = vi.fn(async () => false)

    await outbox.drain(send)
    expect(values.get(item.id)).toMatchObject({ attempts: 1 })
    expect(item.properties.$insert_id).toBe(item.id)

    now += 4_000
    send.mockResolvedValue(true)
    await outbox.drain(send)
    expect(values.size).toBe(0)
  })

  it('evicts oldest and expired records at the configured boundaries', async () => {
    let now = OUTBOX_MAX_AGE_MS + 10
    const { storage, values } = memoryStorage()
    const outbox = new TelemetryOutbox(storage, () => now)
    values.set('expired', {
      id: 'expired',
      name: 'app_session_started',
      properties: {},
      createdAt: 0,
      attempts: 0,
      nextAttemptAt: 0,
    })
    for (let index = 0; index <= OUTBOX_MAX_ITEMS; index += 1) {
      now += 1
      await outbox.enqueue('app_session_started', {}, `id-${index}`)
    }

    expect(values.has('expired')).toBe(false)
    expect(values.size).toBe(OUTBOX_MAX_ITEMS)
    expect(values.has('id-0')).toBe(false)
    expect(outbox.getDroppedCount()).toBe(2)
  })
})

describe('sentry request span boundary', () => {
  it('drops per-resource Gateway spans but keeps API and summary requests', () => {
    expect(
      isNoisyGatewayMediaRequest('http://127.0.0.1:49321/v1/media/token/g/2/segment-0001.m4s'),
    ).toBe(true)
    expect(isNoisyGatewayMediaRequest('http://localhost:49321/v1/media/token/g/2/index.m3u8')).toBe(
      true,
    )
    expect(isNoisyGatewayMediaRequest('https://proxy.example.com/api/v2/match')).toBe(false)
    expect(isNoisyGatewayMediaRequest('http://127.0.0.1:49321/v1/status')).toBe(false)
  })
})

describe('web install identity', () => {
  it('persists until the application resets it', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    const first = getOrCreateWebInstallId(storage)

    expect(getOrCreateWebInstallId(storage)).toBe(first)
    resetWebInstallId(storage)
    expect(getOrCreateWebInstallId(storage)).not.toBe(first)
  })
})

describe('telemetry sanitizer', () => {
  it('filters capability secrets but keeps ordinary diagnostics', () => {
    const result = sanitizeTelemetryValue({
      apiKey: 'secret',
      headers: { Authorization: 'Bearer secret', Accept: 'application/json' },
      filePath: '/Users/example/video.mkv',
    })

    expect(result.value).toEqual({
      apiKey: '[Filtered]',
      headers: { Authorization: '[Filtered]', Accept: 'application/json' },
      filePath: '/Users/example/video.mkv',
    })
  })

  it('normalizes gateway tokens and marks truncation', () => {
    const gateway = sanitizeTelemetryString(
      'GET http://127.0.0.1:49321/v1/media/high-entropy-token/g/2/index.m3u8',
    )
    const long = sanitizeTelemetryString('abcdef', 3)

    expect(gateway.value).toContain('/v1/media/[Filtered]/g/2/index.m3u8')
    expect(long).toEqual({ value: 'abc…[Truncated]', truncated: true })
  })

  it('handles circular objects and bounded collections', () => {
    const circular: Record<string, unknown> = { values: [1, 2, 3] }
    circular.self = circular

    const result = sanitizeTelemetryValue(circular, { maxArrayLength: 2 })

    expect(result.truncated).toBe(true)
    expect(result.value).toEqual({ values: [1, 2], self: '[Circular]' })
  })
})
