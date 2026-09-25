import { describe, expect, it, vi } from 'vitest'
import { DandanplayAPI } from '../adapters/dandanplay-api'

const api = vi.hoisted(() => ({ match: vi.fn(), comment: vi.fn() }))
vi.mock('@renderer/request', () => ({
  apiClient: { match: { postVideoEpisodeId: api.match }, comment: { getDanmu: api.comment } },
}))

describe('加载请求的业务失败与取消', () => {
  it('hTTP 200 的匹配业务失败必须进入恢复流程', async () => {
    api.match.mockResolvedValueOnce({
      success: false,
      errorCode: 100,
      errorMessage: '匹配服务暂不可用',
    })
    await expect(
      new DandanplayAPI().match({ hash: 'abc', size: 10, name: 'a.mp4' }),
    ).rejects.toThrow('匹配服务暂不可用')
  })
  it('弹幕业务失败与合法零条结果不同，取消信号传到统一客户端', async () => {
    const signal = new AbortController().signal
    const adapter = new DandanplayAPI()
    api.comment
      .mockResolvedValueOnce({ success: false, errorMessage: '弹幕服务暂不可用' })
      .mockResolvedValueOnce({ success: true, count: 0, comments: [] })
    await expect(adapter.getDanmu(1, { withRelated: true, chConvert: 0, signal })).rejects.toThrow(
      '弹幕服务暂不可用',
    )
    expect(api.comment).toHaveBeenLastCalledWith(
      1,
      { withRelated: true, chConvert: 0 },
      { signal, silent: true },
    )
    await expect(adapter.getDanmu(1, { withRelated: true, chConvert: 0 })).resolves.toEqual({
      count: 0,
      comments: [],
    })
  })
})
