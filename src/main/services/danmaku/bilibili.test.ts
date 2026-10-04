import { describe, expect, it, vi } from 'vitest'
import {
  BILIBILI_LIMITS,
  BilibiliClient,
  convertBilibiliXml,
  fetchBilibili,
  recognizeBilibili,
} from './bilibili'
import { resolveAdapter } from './registry'
import { DanmakuTasks } from './tasks'

const xml = (
  cid = '22',
  rows = '<d p="1.5,5,25,16711680,0,0,u,999999999999999999">测试 &amp; 弹幕</d>',
) => `<i><chatid>${cid}</chatid><state>0</state>${rows}</i>`
const signal = () => new AbortController().signal
const episode = (id: number, cid: number) => ({ id, cid, title: String(id), long_title: '标题' })

describe('b 站链接弹幕', () => {
  it('保留分 P，剔除跟踪参数，拒绝错误链接', () => {
    const value = recognizeBilibili('https://www.bilibili.com/video/BV1wT8J6NEFS/?p=17&spm=x')!
    expect(value.videoId).toBe('BV1wT8J6NEFS:p17')
    expect(value.canonicalUrl).toBe('https://www.bilibili.com/video/BV1wT8J6NEFS/?p=17')
    expect(recognizeBilibili('https://www.bilibili.com/video/BV1Lyhb69EUf/')?.videoId).toMatch(
      /:p1$/,
    )
    expect(resolveAdapter(value.canonicalUrl).identity).toEqual(value)
    for (const url of [
      'https://www.bilibili.com.evil/video/BV1wT8J6NEFS/',
      'file:///video/BV1wT8J6NEFS',
      'https://u:p@www.bilibili.com/video/BV1wT8J6NEFS',
      'https://www.bilibili.com:3000/video/BV1wT8J6NEFS',
      ...['0', '-1', '1.5', 'foo', '1&p=2'].map(
        (p) => `https://www.bilibili.com/video/BV1wT8J6NEFS?p=${p}`,
      ),
    ])
      expect(recognizeBilibili(url)).toBeNull()
  })
  it('取指定 P 的 CID，不回退第一 P，最终以 CID 去重', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(init?.redirect).toBe('error')
      expect(init?.headers).not.toHaveProperty('Cookie')
      if (String(url).includes('/view?'))
        return Response.json({
          code: 0,
          data: {
            title: '视频',
            pages: [
              { page: 1, cid: 11 },
              { page: 17, cid: 22, part: '17' },
            ],
          },
        })
      expect(String(url)).toBe('https://comment.bilibili.com/22.xml')
      return new Response(xml())
    })
    const identity = recognizeBilibili('https://www.bilibili.com/video/BV1wT8J6NEFS?p=17')!
    const result = await fetchBilibili(identity, signal(), () => {}, fetcher)
    expect(result).toMatchObject({ identity: { videoId: '22' }, content: { count: 1 } })
    await expect(
      fetchBilibili(
        recognizeBilibili(identity.canonicalUrl.replace('p=17', 'p=18'))!,
        signal(),
        () => {},
        fetcher,
      ),
    ).rejects.toThrow('不存在第 18 P')
  })
  it('sS 只返回候选，EP 定位指定集并使用其 CID', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/season?')
        ? Response.json({
            code: 0,
            result: { title: '番剧', episodes: [episode(1, 11), episode(2, 22)] },
          })
        : new Response(xml()),
    )
    const selection = await fetchBilibili(
      recognizeBilibili('https://www.bilibili.com/bangumi/play/ss73081')!,
      signal(),
      () => {},
      fetcher,
    )
    expect(selection).toMatchObject({
      title: '番剧',
      episodes: [
        { url: 'https://www.bilibili.com/bangumi/play/ep1' },
        { url: 'https://www.bilibili.com/bangumi/play/ep2' },
      ],
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const result = await fetchBilibili(
      recognizeBilibili('https://www.bilibili.com/bangumi/play/ep2')!,
      signal(),
      () => {},
      fetcher,
    )
    expect(result).toMatchObject({ identity: { videoId: '22' }, title: '番剧 · 第 2 集 标题' })
    await expect(
      fetchBilibili(
        recognizeBilibili('https://www.bilibili.com/bangumi/play/ep3')!,
        signal(),
        () => {},
        fetcher,
      ),
    ).rejects.toThrow('未找到')
  })
  it('xML 转换保留颜色时间和文字，过滤特殊弹幕与无效行，长 ID 去重', async () => {
    const row = (time: string, mode: number, id: string) =>
      `<d p="${time},${mode},25,16711680,0,0,u,${id}">测试 &amp; 弹幕</d>`
    const result = await convertBilibiliXml(
      xml(
        '22',
        row('2', 5, '999999999999999999') +
          row('2', 5, '999999999999999999') +
          row('1', 2, '2') +
          row('3', 4, '3') +
          row('4', 7, '4') +
          row('NaN', 1, '5'),
      ),
      '22',
    )
    expect(result.skipped).toBe(2)
    expect(result.content.comments.map((v) => v.p)).toEqual([
      '1,1,16711680,0',
      '2,5,16711680,0',
      '3,4,16711680,0',
    ])
    expect(result.content.comments[0].m).toBe('测试 & 弹幕')
    await expect(convertBilibiliXml(xml('33'), '22')).rejects.toThrow('不匹配')
    await expect(convertBilibiliXml(xml('22', ''), '22')).rejects.toThrow('没有可导入')
    await expect(convertBilibiliXml('<!DOCTYPE i><i/>', '22')).rejects.toThrow('不受支持')
    await expect(convertBilibiliXml('<i>', '22')).rejects.toThrow('解析失败')
  })
  it('业务错误不能变成空结果，超过响应预算及时取消读取', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: -412 }))
    await expect(
      fetchBilibili(
        recognizeBilibili('https://www.bilibili.com/bangumi/play/ep1')!,
        signal(),
        () => {},
        fetcher,
      ),
    ).rejects.toThrow('请求受限')
    expect(fetcher).toHaveBeenCalledTimes(1)
    const cancelled = vi.fn()
    const client = new BilibiliClient(
      signal(),
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(BILIBILI_LIMITS.responseBytes + 1))
            },
            cancel: cancelled,
          }),
        ),
    )
    await expect(client.request('https://comment.bilibili.com/22.xml')).rejects.toThrow('大小限制')
    expect(cancelled).toHaveBeenCalled()
    await expect(client.request('https://evil.test/')).rejects.toThrow('不受支持')
  })
  it('任务返回选集并释放窗口占用；取消后不发布迟到选择', async () => {
    let finish: (value: { title: string; episodes: [] }) => void = () => {}
    const result = new Promise<{ title: string; episodes: [] }>((resolve) => {
      finish = resolve
    })
    const tasks = new DanmakuTasks(() => ({
      identity: recognizeBilibili('https://www.bilibili.com/bangumi/play/ss1')!,
      fetch: async () => result,
    }))
    const pending = tasks.run(
      1,
      'test',
      'url',
      () => {},
      () => () => {},
    )
    tasks.cancel(1, 'test')
    finish({ title: '番剧', episodes: [] })
    expect(await pending).toMatchObject({ ok: false })
    expect(
      await tasks.run(
        1,
        'again',
        'url',
        () => {},
        () => () => {},
      ),
    ).toMatchObject({ ok: true, selection: { title: '番剧' } })
  })
})
