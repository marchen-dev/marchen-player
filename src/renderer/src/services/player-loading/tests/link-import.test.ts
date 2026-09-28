import type { PlayerLoadingService } from '@marchen/player-loading'
import type { LinkResponse } from '@marchen/shared/danmaku'
import type {LinkTransport} from '../../danmaku/link-import';
import { BehaviorSubject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { LinkImportController  } from '../../danmaku/link-import'

const epUrl = 'https://www.bilibili.com/bangumi/play/ep2'
const result: LinkResponse = {
  ok: true,
  result: {
    identity: { provider: 'bilibili', videoId: '22', canonicalUrl: epUrl },
    title: '第 2 集',
    content: { count: 1, comments: [{ cid: 1, p: '1,1,16777215,0', m: '弹幕' }] },
    skipped: 0,
    segments: 1,
  },
}
const selection: LinkResponse = {
  ok: true,
  selection: { title: '番剧', episodes: [{ title: '第 2 集', url: epUrl }] },
}
function setup(fetchResult: (url: string) => Promise<LinkResponse>) {
  const player = {
    sessionId: 1,
    currentState: { step: 'ready', danmaku: [] as { source: string }[] },
    state$: new BehaviorSubject(0),
    addLinkDanmaku: vi.fn(async () => {}),
  }
  const transport: LinkTransport = {
    identify: async (url) => ({
      ok: true,
      identity: { provider: 'bilibili', videoId: 'preliminary', canonicalUrl: url },
    }),
    fetch: vi.fn(async (_id, url) => fetchResult(url)),
    cancel: vi.fn(async () => {}),
    listen: () => () => {},
  }
  const controller = new LinkImportController(player as unknown as PlayerLoadingService, transport)
  return { player, transport, controller }
}
describe('链接导入选集与最终身份', () => {
  it('整季等待选择，不默认保存；选集后保存最终 CID 身份', async () => {
    const { player, controller } = setup(async (url) => (url === epUrl ? result : selection))
    await controller.start('season', 0)
    expect(controller.getSnapshot().status).toBe('selecting')
    expect(player.addLinkDanmaku).not.toHaveBeenCalled()
    await controller.choose('unlisted')
    expect(player.addLinkDanmaku).not.toHaveBeenCalled()
    await controller.choose(epUrl)
    expect(player.addLinkDanmaku).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'link:bilibili:22', videoId: '22' }),
      1,
      expect.any(AbortSignal),
    )
    expect(controller.getSnapshot().status).toBe('success')
    controller.dispose()
  })
  it('bV 和 EP 最终 CID 相同则不重复写入', async () => {
    const { player, controller } = setup(async () => result)
    player.currentState.danmaku = [{ source: 'link:bilibili:22' }]
    await controller.start('bv', 0)
    expect(controller.getSnapshot().message).toBe('已经添加过该来源')
    expect(player.addLinkDanmaku).not.toHaveBeenCalled()
    controller.dispose()
  })
  it.each(['cancel', 'session'] as const)('等待选择时 %s 使候选失效', async (action) => {
    const { player, controller, transport } = setup(async () => selection)
    await controller.start('season', 0)
    if (action === 'cancel') controller.cancel()
    else {
      player.sessionId++
      player.state$.next(1)
    }
    expect(controller.getSnapshot().selection).toBeUndefined()
    await controller.choose(epUrl)
    expect(transport.fetch).toHaveBeenCalledTimes(1)
    expect(player.addLinkDanmaku).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('解析中换视频不发布迟到候选', async () => {
    let finish: (value: LinkResponse) => void = () => {}
    const promise = new Promise<LinkResponse>((resolve) => {
      finish = resolve
    })
    const { player, controller } = setup(async () => promise)
    const started = controller.start('season', 0)
    await Promise.resolve()
    player.sessionId++
    player.state$.next(1)
    finish(selection)
    await started
    expect(controller.getSnapshot().selection).toBeUndefined()
    expect(player.addLinkDanmaku).not.toHaveBeenCalled()
    controller.dispose()
  })
})
