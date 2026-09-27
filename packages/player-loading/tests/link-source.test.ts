import type { LinkDanmakuEntry } from '@marchen/shared/danmaku'
import { filter, firstValueFrom, timeout } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { LinkImportController } from '../../../src/renderer/src/services/danmaku/link-import'
import { PlayerLoadingService } from '../src/service'
import { createMockDeps } from './helpers/mock-ports'
const entry: LinkDanmakuEntry = {
  type: 'link',
  provider: 'youku',
  videoId: 'X123',
  canonicalUrl: 'https://v.youku.com/v_show/id_X123.html',
  title: '测试',
  source: 'link:youku:X123',
  selected: true,
  offsetSeconds: 0,
  content: { count: 1, comments: [{ cid: 1, m: '测试', p: '10,1,#ffffff,0' }] },
}
const ready = (service: PlayerLoadingService) =>
  firstValueFrom(
    service.state$.pipe(
      filter((s) => s.step === 'ready'),
      timeout(3000),
    ),
  )
async function setup() {
  const deps = createMockDeps()
  const service = new PlayerLoadingService(deps)
  service.loadFromPath('/test.mkv')
  await ready(service)
  return { deps, service }
}
describe('用户链接来源提交', () => {
  it('序列化来源修改并保持原始时间，重新匹配保留链接', async () => {
    const { service } = await setup()
    try {
      await Promise.all([
        service.addLinkDanmaku(entry, service.sessionId, new AbortController().signal),
        service.addLocalDanmaku({
          type: 'local',
          source: 'file',
          selected: true,
          content: { count: 0, comments: [] },
        }),
      ])
      await service.setDanmakuSourceOffset(entry.source, 2)
      const state = service.currentState
      expect(state.step).toBe('ready')
      if (state.step !== 'ready') return
      expect(state.danmaku.find((e) => e.source === entry.source)?.content.comments[0].p).toBe(
        '10,1,#ffffff,0',
      )
      expect(state.mergedComments.some((c) => c.p === '12,1,#ffffff,0')).toBe(true)
      service.rematch({ animeId: 99, episodeId: 999, animeTitle: '新匹配', episodeTitle: '一' })
      await ready(service)
      const after = service.currentState
      if (after.step !== 'ready') throw new Error('无效数据')
      expect(after.danmaku.find((e) => e.source === entry.source)).toMatchObject({
        offsetSeconds: 2,
      })
      expect(after.danmaku.some((e) => e.source === 'file')).toBe(true)
      await expect(
        service.addLinkDanmaku(entry, service.sessionId, new AbortController().signal),
      ).rejects.toThrow('已经添加')
    } finally {
      service.destroy()
    }
  })
  it('事务失败不发布新来源，取消在提交中可被守卫识别', async () => {
    const { service, deps } = await setup()
    try {
      deps.cache.commit = vi.fn(async () => {
        throw new Error('磁盘不可写')
      })
      await expect(
        service.addLinkDanmaku(entry, service.sessionId, new AbortController().signal),
      ).rejects.toThrow('磁盘不可写')
      expect(service.currentState).not.toMatchObject({ danmaku: expect.arrayContaining([entry]) })
      const abort = new AbortController()
      deps.cache.commit = vi.fn(async (_hash, _data, valid) => {
        abort.abort()
        if (!valid()) throw new Error('已取消')
      })
      await expect(service.addLinkDanmaku(entry, service.sessionId, abort.signal)).rejects.toThrow(
        '已取消',
      )
    } finally {
      service.destroy()
    }
  })
  it('同 hash 重开仍拒绝旧会话', async () => {
    const { service } = await setup()
    try {
      const previous = service.sessionId
      service.loadFromPath('/test.mkv')
      await ready(service)
      await expect(
        service.addLinkDanmaku(entry, previous, new AbortController().signal),
      ).rejects.toThrow('视频已切换')
    } finally {
      service.destroy()
    }
  })
  it('抓取迟到时不写入新视频并释放进度监听', async () => {
    const { service } = await setup()
    let resolve!: (value: {
      ok: true
      result: {
        identity: typeof entry
        title: string
        content: typeof entry.content
        skipped: number
        segments: number
      }
    }) => void
    const detach = vi.fn()
    const cancel = vi.fn(async () => {})
    const controller = new LinkImportController(service, {
      identify: async () => ({ ok: true, identity: entry }),
      fetch: () =>
        new Promise((r) => {
          resolve = r
        }),
      cancel,
      listen: () => detach,
    })
    try {
      const pending = controller.start(entry.canonicalUrl, 0)
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
      service.loadFromPath('/test.mkv')
      await ready(service)
      resolve({
        ok: true,
        result: {
          identity: entry,
          title: entry.title,
          content: entry.content,
          skipped: 0,
          segments: 1,
        },
      })
      await pending
      expect(cancel).toHaveBeenCalledOnce()
      expect(detach).toHaveBeenCalledOnce()
      expect(controller.getSnapshot().status).toBe('cancelled')
      expect(service.currentState).not.toMatchObject({ danmaku: expect.arrayContaining([entry]) })
    } finally {
      controller.dispose()
      service.destroy()
    }
  })
  it('抓取完成遇到重匹配时等待新结果再合并', async () => {
    const {service,deps}=await setup()
    try {
      let finish!: (value: {count:number;comments:[]}) => void
      vi.mocked(deps.api.getDanmu).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
      service.rematch({animeId:2,episodeId:2,animeTitle:'新剧集',episodeTitle:'二'})
      const pending=service.addLinkDanmaku(entry,service.sessionId,new AbortController().signal)
      await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
      finish({count:0,comments:[]})
      await pending
      const current=service.currentState
      if(current.step!=='ready') throw new Error('没有恢复 ready')
      expect(current.match.episodeId).toBe(2)
      expect(current.danmaku).toContainEqual(entry)
    } finally {service.destroy()}
  })

})
