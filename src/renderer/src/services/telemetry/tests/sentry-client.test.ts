import type { CommonTelemetryProperties } from '../contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSentryTelemetryClient } from '../sentry/client'

const sentry = vi.hoisted(() => ({ setTag: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@sentry/react', () => sentry)

beforeEach(() => vi.clearAllMocks())

/** 每个事件都带的公共属性，这里只关心其中的界面语言 */
const common: CommonTelemetryProperties = {
  release: 'Marchen@test',
  dist: 'test',
  version: '0.0.0',
  commit: 'test',
  environment: 'development',
  app_target: 'web',
  runtime: 'renderer',
  platform: 'test',
  arch: 'test',
  app_session_id: 'session',
}

describe('sentry 的界面语言标签', () => {
  it('产品事件带着界面语言时同步为全局标签，之后的错误可以按语言筛选', () => {
    const client = createSentryTelemetryClient()
    client.capture('app_session_started', { ...common, ui_language: 'en' })
    expect(sentry.setTag).toHaveBeenCalledWith('ui_language', 'en')
    // 切换语言后的下一个事件更新标签
    client.capture('feature_used', {
      ...common,
      feature: 'x',
      action: 'y',
      ui_language: 'zh-CN',
    })
    expect(sentry.setTag).toHaveBeenLastCalledWith('ui_language', 'zh-CN')
  })

  it('事件没有界面语言时不改动标签', () => {
    createSentryTelemetryClient().capture('feature_used', { ...common, feature: 'x', action: 'y' })
    expect(sentry.setTag).not.toHaveBeenCalled()
  })
})
