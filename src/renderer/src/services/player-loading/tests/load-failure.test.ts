import type { ErrorState } from '@marchen/player-loading'
import { describe, expect, it } from 'vitest'
import { describeLoadFailure } from '../load-failure'

const base = (patch: Partial<ErrorState> = {}, code?: string): ErrorState => ({
  step: 'error',
  error: { message: '底层错误', previousStep: 'importing', code },
  ...patch,
})
const provider = { providerRequest: { sourceId: 's1', itemRef: 'ep1' } }

describe('加载失败文案与操作', () => {
  it('本地文件提供重新选择', () => {
    expect(describeLoadFailure(base(), false)).toEqual({
      title: '无法打开视频文件',
      description: '文件可能已被移动、删除或无法读取',
      actions: ['reselect'],
    })
  })

  it('远程链接在桌面端可重试或更换，Web 端只能返回', () => {
    const remote = base({ remoteRequest: { url: 'https://example.com/a.mkv' } })
    expect(describeLoadFailure(remote, false).actions).toEqual(['retry', 'change_link'])
    expect(describeLoadFailure(remote, true).actions).toEqual([])
  })

  it('媒体源连接类错误显示具体原因并允许重试', () => {
    expect(describeLoadFailure(base(provider, 'unreachable'), false)).toEqual({
      title: '无法连接媒体源',
      description: '无法连接服务器，请检查地址和网络',
      actions: ['retry'],
    })
  })

  it.each(['auth_failed', 'forbidden', 'source_removed', 'not_found'])(
    '媒体源 %s 引导前往媒体源处理，不提供重试',
    (code) => {
      expect(describeLoadFailure(base(provider, code), false).actions).toEqual(['open_source'])
    },
  )

  it.each(['certificate', 'unsupported_version', 'range_unsupported'])(
    '媒体源 %s 重试也无法解决，不提供操作',
    (code) => {
      expect(describeLoadFailure(base(provider, code), false)).toMatchObject({
        title: '无法播放此媒体源视频',
        actions: [],
      })
    },
  )

  it('媒体源没有错误码时按连接失败处理', () => {
    expect(describeLoadFailure(base(provider), false)).toEqual({
      title: '无法连接媒体源',
      description: '请检查服务器是否在线后重试',
      actions: ['retry'],
    })
    expect(describeLoadFailure(base(provider, 'ENOENT'), false).actions).toEqual(['retry'])
  })
})
