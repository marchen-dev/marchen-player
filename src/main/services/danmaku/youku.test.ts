import { mergeSources, validateOffset } from '@marchen/shared/danmaku'
import { describe, expect, it, vi } from 'vitest'
import { DanmakuTasks } from './tasks'
import { AnonymousClient, convertRows, fetchYouku, recognizeYouku } from './youku'

const identity = recognizeYouku('https://v.youku.com/v_show/id_XMzcxNTY4MzQ4.html?spm=test')!
describe('链接弹幕', () => {
  it('规范化跟踪参数并限制可识别地址', () => {
    expect(identity.videoId).toBe('XMzcxNTY4MzQ4')
    expect(recognizeYouku('https://v.youku.com/?vid=XMzcxNTY4MzQ4')).toEqual(identity)
    for (const url of [
      'file:///tmp/a',
      'https://evil.test/?vid=X123',
      'https://u:p@v.youku.com/?vid=X123',
      'https://v.youku.com:3000/?vid=X123',
    ])
      expect(recognizeYouku(url)).toBeNull()
  })
  it('颜色、无效行和字符串 ID 去重', () => {
    const row = {
      id: '999999999999999999',
      playat: 1200,
      content: '测试',
      propertis: '{"color":4278190080}',
    }
    const value = convertRows([row, row, { ...row, id: '2', playat: 'bad' }], new Set(), 1)
    expect(value.skipped).toBe(1)
    expect(value.comments).toEqual([{ cid: 1, m: '测试', p: '1.2,1,#000000,0' }])
  })
  it('偏移不累积且负时间只隐藏派生数据', () => {
    const entry = {
      type: 'link' as const,
      ...identity,
      title: '测试',
      source: 'test',
      selected: true,
      offsetSeconds: 2,
      content: { count: 1, comments: [{ cid: 1, m: '测试', p: '10,1,#ffffff,0' }] },
    }
    expect(mergeSources([entry])[0].p).toBe('12,1,#ffffff,0')
    expect(mergeSources([{ ...entry, offsetSeconds: -11 }])).toEqual([])
    expect(mergeSources([{ ...entry, offsetSeconds: 0 }])[0].p).toBe('10,1,#ffffff,0')
    expect(entry.content.comments[0].p).toBe('10,1,#ffffff,0')
    expect(() => validateOffset(NaN)).toThrow()
  })
  it('token_empty 初始化后串行获取全部分段', async () => {
    let segments = 0
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('openapi')) return Response.json({ title: '测试', duration: 60 })
      if (String(url).includes('weakget'))
        return Response.json(
          { ret: ['FAIL_SYS_TOKEN_EMPTY'] },
          { headers: { 'set-cookie': '_m_h5_tk=token_123; Path=/' } },
        )
      expect((init?.headers as Record<string, string>).Cookie).toContain('_m_h5_tk=token_123')
      segments++
      return Response.json({
        data: {
          result: JSON.stringify({
            data: { result: [{ id: String(segments), playat: segments * 1000, content: '测试' }] },
          }),
        },
      })
    })
    const result = await fetchYouku(identity, new AbortController().signal, () => {}, fetcher)
    expect(result.segments).toBe(2)
    expect(result.content.count).toBe(2)
  })
  it('不把异常分段视为空弹幕', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('openapi')
        ? Response.json({ duration: 1 })
        : String(url).includes('weakget')
          ? Response.json({}, { headers: { 'set-cookie': '_m_h5_tk=x_1' } })
          : Response.json({ data: {} }),
    )
    await expect(
      fetchYouku(identity, new AbortController().signal, () => {}, fetcher),
    ).rejects.toThrow('第 1 段')
  })
  it('限制读取大小并及时取消 body', async () => {
    const cancelled = vi.fn()
    const client = new AnonymousClient(
      new AbortController().signal,
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(4 * 1024 * 1024 + 1))
            },
            cancel: cancelled,
          }),
        ),
    )
    await expect(client.request('https://acs.youku.com/a')).rejects.toThrow('大小限制')
    expect(cancelled).toHaveBeenCalled()
  })
  it('任务取消按窗口隔离并释放监听', async () => {
    let signal: AbortSignal | undefined
    const detach = vi.fn()
    const task = new DanmakuTasks(() => ({
      identity,
      fetch: async (_identity, s) => {
        signal = s
        await new Promise((_, reject) =>
          s.addEventListener('abort', () => reject(new Error('无效数据')), { once: true }),
        )
        throw new Error('无效数据')
      },
    }))
    const pending = task.run(
      1,
      'a',
      '',
      () => {},
      () => detach,
    )
    task.cancel(2, 'a')
    expect(signal?.aborted).toBe(false)
    expect(
      (
        await task.run(
          1,
          'b',
          '',
          () => {},
          () => detach,
        )
      ).ok,
    ).toBe(false)
    task.cancel(1, 'a')
    expect((await pending).ok).toBe(false)
    expect(detach).toHaveBeenCalledOnce()
  })
  it('网络失败有限重试且取消中断退避', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>(async () => Response.json({}, { status: 503 }))
      const client = new AnonymousClient(new AbortController().signal, fetcher)
      const pending = expect(client.request('https://acs.youku.com/a')).rejects.toThrow('HTTP 503')
      await vi.runAllTimersAsync()
      await pending
      expect(fetcher).toHaveBeenCalledTimes(3)
      const controller = new AbortController()
      const retry = new AnonymousClient(controller.signal, fetcher)
      const cancelled = expect(retry.request('https://acs.youku.com/a')).rejects.toThrow()
      controller.abort()
      await vi.runAllTimersAsync()
      await cancelled
    } finally {
      vi.useRealTimers()
    }
  })
  it('响应内大整数 ID 不丢精度，令牌可更新', async () => {
    let count = 0
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      count++
      if (count === 2)
        expect((init?.headers as Record<string, string>).Cookie).toBe('_m_h5_tk=new_123')
      return new Response('{"id":999999999999999999}', {
        headers: { 'set-cookie': '_m_h5_tk=new_123; Path=/' },
      })
    })
    const client = new AnonymousClient(new AbortController().signal, fetcher)
    expect(await client.request('https://acs.youku.com/a')).toEqual({ id: '999999999999999999' })
    await client.request('https://acs.youku.com/a')
    expect(client.token()).toBe('new')
    await expect(client.request('https://evil.test/')).rejects.toThrow('不受支持')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('过长时长和空结果不能形成成功来源', async () => {
    const tooLong = vi.fn<typeof fetch>(async () => Response.json({ duration: 21600 }))
    await expect(
      fetchYouku(identity, new AbortController().signal, () => {}, tooLong),
    ).rejects.toThrow('时长')
    const empty = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('openapi')
        ? Response.json({ duration: 1 })
        : String(url).includes('weakget')
          ? Response.json({}, { headers: { 'set-cookie': '_m_h5_tk=a_1' } })
          : Response.json({ data: { result: { data: { result: [] } } } }),
    )
    await expect(
      fetchYouku(identity, new AbortController().signal, () => {}, empty),
    ).rejects.toThrow('没有可导入')
  })
  it('窗口销毁中止慢请求并允许后续任务', async () => {
    let close: (() => void) | undefined
    let count = 0
    const tasks = new DanmakuTasks(() => ({ identity, fetch: async (_identity, signal) => {
      count++
      if (count === 1) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('窗口关闭')), {once:true}))
      return { identity, title:'测试', content:{count:1,comments:[]}, skipped:0, segments:1 }
    } }))
    const detach = vi.fn()
    const first = tasks.run(1,'first','',()=>{}, callback => { close=callback; return detach })
    close!()
    expect((await first).ok).toBe(false)
    expect(detach).toHaveBeenCalledOnce()
    expect((await tasks.run(1,'retry','',()=>{},()=>detach)).ok).toBe(true)
    expect(detach).toHaveBeenCalledTimes(2)
  })

})
