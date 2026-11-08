import type { LoadingState } from '@marchen/player-loading'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalDanmakuValidationError, readLocalDanmaku } from '../../../lib/local-danmaku'
import { importLocalDanmaku } from '../../danmaku/local-import'
import { reportOperationalError } from '../../telemetry/operational-errors'

vi.mock('../../../lib/local-danmaku', () => ({
  LocalDanmakuValidationError: class extends Error {},
  readLocalDanmaku: vi.fn(),
}))
vi.mock('../../telemetry/operational-errors', () => ({ reportOperationalError: vi.fn() }))
const entry = {
  type: 'local' as const,
  source: 'local-file:1/a.json',
  selected: true,
  content: { count: 1, comments: [{ cid: 1, m: '本地', p: '1,1,0,1' }] },
}
function setup() {
  const state: LoadingState = {
    step: 'ready',
    video: {
      hash: 'hash',
      name: 'test.mp4',
      size: 1,
      playList: [],
      source: { kind: 'electron-file', hash: 'hash', name: 'test.mp4', size: 1, path: '/test.mp4' },
    },
    match: { animeId: 0, episodeId: 0, animeTitle: '', episodeTitle: '' },
    danmaku: [],
    mergedComments: [],
  }
  return {
    sessionId: 1,
    currentState: state,
    addLocalDanmaku: vi.fn(async () => {
      state.danmaku.push(entry)
    }),
  }
}
const file = new File(['[]'], 'a.json')
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readLocalDanmaku).mockResolvedValue({ entry, skippedCount: 2 })
})

describe('共享本地导入协调', () => {
  it('成功返回条数，读取后再核对会话，切换后不提交', async () => {
    const service = setup()
    expect(await importLocalDanmaku(file, service, new AbortController().signal)).toMatchObject({
      hash: 'hash',
      skippedCount: 2,
    })
    service.addLocalDanmaku.mockClear()
    vi.mocked(readLocalDanmaku).mockImplementationOnce(async () => {
      service.sessionId++
      return { entry, skippedCount: 0 }
    })
    expect(await importLocalDanmaku(file, service, new AbortController().signal)).toBeUndefined()
    expect(service.addLocalDanmaku).not.toHaveBeenCalled()
    expect(reportOperationalError).not.toHaveBeenCalled()
  })

  it('保存失败只上报一次稳定原因，校验拒绝不上报', async () => {
    const service = setup()
    service.addLocalDanmaku.mockRejectedValueOnce(new Error('quota'))
    await expect(importLocalDanmaku(file, service, new AbortController().signal)).rejects.toThrow(
      '保存弹幕失败',
    )
    expect(reportOperationalError).toHaveBeenCalledExactlyOnceWith(
      'player',
      'local_danmaku_import',
      expect.objectContaining({ code: 'local_danmaku_save_failed' }),
    )
    vi.mocked(reportOperationalError).mockClear()
    vi.mocked(readLocalDanmaku).mockRejectedValueOnce(new LocalDanmakuValidationError('格式错误'))
    await expect(importLocalDanmaku(file, service, new AbortController().signal)).rejects.toThrow(
      '格式错误',
    )
    expect(reportOperationalError).not.toHaveBeenCalled()
  })

  it('读取失败上报，读取过程中取消则静默结束', async () => {
    vi.mocked(readLocalDanmaku).mockRejectedValueOnce(new Error('读取失败'))
    await expect(importLocalDanmaku(file, setup(), new AbortController().signal)).rejects.toThrow(
      '读取弹幕文件失败',
    )
    expect(reportOperationalError).toHaveBeenCalledExactlyOnceWith(
      'player',
      'local_danmaku_import',
      expect.objectContaining({ code: 'local_danmaku_read_failed' }),
    )
    vi.mocked(reportOperationalError).mockClear()
    const controller = new AbortController()
    vi.mocked(readLocalDanmaku).mockImplementationOnce(async () => {
      controller.abort()
      throw new Error('晚到错误')
    })
    expect(await importLocalDanmaku(file, setup(), controller.signal)).toBeUndefined()
    expect(reportOperationalError).not.toHaveBeenCalled()
  })
})
