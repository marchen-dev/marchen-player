import { expect, it, vi } from 'vitest'
import { loadSubtitleFonts } from '../subtitles/fonts'
import { FONT_ATTACHMENT_BUDGET, preflightMatroskaAttachments } from '../subtitles/matroska'

it('超限附件只读头部，跳过附件载荷和库查询', async () => {
  // 未知长度 Segment + 四字节长度 Attachments；模拟超大文件但不分配载荷。
  const size = FONT_ATTACHMENT_BUDGET + 1
  const header = new Uint8Array([
    0x18,
    0x53,
    0x80,
    0x67,
    0xFF,
    0x19,
    0x41,
    0xA4,
    0x69,
    0x10 | (size >>> 24),
    size >>> 16,
    size >>> 8,
    size,
  ])
  const read = vi.fn(async (start: number, end: number) => {
    expect(end - start).toBeLessThanOrEqual(12)
    const result = new Uint8Array(end - start)
    result.set(header.subarray(start, end))
    return result
  })
  const source = { size: header.length + size, read }
  expect((await preflightMatroskaAttachments(source)).allowed).toBe(false)
  const result = await loadSubtitleFonts(source)
  expect(result.urls).toEqual([])
  expect(result.warning).toContain('32 MiB')
  result.close()
  result.close()
})
it('损坏结构回退，已取消读取不吞掉取消信号', async () => {
  const source = { size: 4, read: async () => new Uint8Array(4) }
  expect((await loadSubtitleFonts(source)).warning).toContain('默认字体')
  const controller = new AbortController()
  controller.abort()
  await expect(loadSubtitleFonts(source, controller.signal)).rejects.toThrow()
})

it('长片预检跳过 4 GiB Cluster，不随媒体长度分配或读取载荷', async () => {
  const clusterEnd = 5 + 9 + 2 ** 32
  const headers = [
    { at: 0, data: new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xFF]) },
    { at: 5, data: new Uint8Array([0x1F, 0x43, 0xB6, 0x75, 0x09, 0, 0, 0, 0]) },
    { at: clusterEnd, data: new Uint8Array([0x19, 0x41, 0xA4, 0x69, 0x80]) },
  ]
  let bytes = 0
  const result = await preflightMatroskaAttachments({
    size: clusterEnd + 5,
    read: async (start, end) => {
      bytes += end - start
      const output = new Uint8Array(end - start)
      for (const h of headers)
        for (let i = 0; i < h.data.length; i++)
          if (h.at + i >= start && h.at + i < end) output[h.at + i - start] = h.data[i]
      return output
    },
  })
  expect(result).toEqual({ allowed: true, bytes: 5 })
  expect(bytes).toBeLessThan(40)
})
