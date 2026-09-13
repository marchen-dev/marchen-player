import type { SubtitleCue } from '../subtitles/matroska'
import { expect, it } from 'vitest'
import { assDialogue, MatroskaSubtitles } from '../subtitles/matroska'

const concat = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap((x) => [...x]))
const text = (s: string) => new TextEncoder().encode(s)
const uint = (n: number) => (n < 256 ? new Uint8Array([n]) : new Uint8Array([n >> 16, n >> 8, n]))
const element = (id: number, body: Uint8Array, unknown = false) => {
  const hex = id.toString(16)
  const key = new Uint8Array(hex.match(/../g)!.map((x) => Number.parseInt(x, 16)))
  const size = unknown
    ? new Uint8Array([0xFF])
    : body.length < 127
      ? new Uint8Array([0x80 | body.length])
      : new Uint8Array([0x40 | (body.length >> 8), body.length & 255])
  return concat(key, size, body)
}
const e = element
const header = '[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nStyle: Test,Arial,20\n[Events]\n'
const track = (number: number, codec: string) =>
  e(
    0xAE,
    concat(
      e(0xD7, uint(number)),
      e(0x73C5, new Uint8Array([255, 255, 255, 255, 255, 255, 255, 254])),
      e(0x83, uint(17)),
      e(0x86, text(codec)),
      e(0x63A2, text(header)),
      e(0x536E, text('中文特效')),
      e(0x22B59C, text('chi')),
      e(0x22B59D, text('zh-Hans')),
      e(0x88, uint(0)),
      e(0x55AA, uint(1)),
    ),
  )
const group = (number: number, payload: string) =>
  e(
    0xA0,
    concat(
      e(0xA1, concat(new Uint8Array([0x80 | number, 0xFF, 0x9C, 0]), text(payload))),
      e(0x9B, uint(1500)),
    ),
  )
const fixture = () =>
  e(
    0x18538067,
    concat(
      e(0x1549A966, e(0x2AD7B1, uint(1000000))),
      e(0x1654AE6B, concat(track(1, 'S_TEXT/ASS'), track(2, 'S_TEXT/SSA'), track(3, 'S_HDMV/PGS'))),
      e(
        0x1F43B675,
        concat(
          e(0xE7, uint(10000)),
          group(1, '2,3,Test,,0,0,0,,你好,世界'),
          group(2, '1,,Test,,0,0,0,,SSA'),
        ),
        true,
      ),
      e(0x1F43B675, concat(e(0xE7, uint(12000)), group(1, '0,0,Test,,0,0,0,,下一句'))),
    ),
    true,
  )
const open = (bytes: Uint8Array = fixture()) =>
  MatroskaSubtitles.open({
    size: bytes.length,
    read: async (start, end) => bytes.slice(start, end),
  })

it('保留多轨元数据、64 位 UID 和 CodecPrivate，识别图片字幕', async () => {
  const reader = await open()
  expect(reader.tracks).toHaveLength(3)
  expect(reader.tracks[0]).toMatchObject({
    uid: '18446744073709551614',
    language: 'zh-Hans',
    title: '中文特效',
    default: false,
    forced: true,
    header,
    supported: true,
  })
  expect(reader.tracks[2]).toMatchObject({ supported: false, header: '' })
  await expect(reader.cues(3).next()).rejects.toThrow('图片字幕')
})
it('读取未知长度 Cluster、非零起点、负偏移及多个 Cluster', async () => {
  const reader = await open()
  const cues: SubtitleCue[] = []
  for await (const cue of reader.cues(1)) cues.push(cue)
  expect(cues.map((x) => [x.start, x.end])).toEqual([
    [9.9, 11.4],
    [11.9, 13.4],
  ])
  expect(assDialogue(cues[0], 'S_TEXT/ASS')).toEqual({
    order: 2,
    line: 'Dialogue: 3,0:00:09.90,0:00:11.40,Test,,0,0,0,,你好,世界',
  })
  const ssa = await reader.cues(2).next()
  expect(assDialogue(ssa.value!, 'S_TEXT/SSA').line).toContain('Dialogue: Marked=0,')
})
it('取消和文件短读立即终止字幕消费者', async () => {
  const reader = await open()
  const abort = new AbortController()
  abort.abort()
  await expect(reader.cues(1, abort.signal).next()).rejects.toThrow()
  await expect(
    MatroskaSubtitles.open({ size: 100, read: async () => new Uint8Array(1) }),
  ).rejects.toThrow('短读')
})
it('拒绝损坏事件，不吞掉文本中的逗号或伪造时间', () => {
  expect(() => assDialogue({ start: 0, end: 1, text: 'broken' }, 'S_TEXT/ASS')).toThrow('字段不足')
})

it('内嵌 UTF8 返回原始文本，损坏轨失败后仍可读取另一轨', async () => {
  const bytes = e(
    0x18538067,
    concat(
      e(0x1549A966, e(0x2AD7B1, uint(1000000))),
      e(0x1654AE6B, concat(track(1, 'S_TEXT/UTF8'), track(2, 'S_TEXT/ASS'))),
      e(
        0x1F43B675,
        concat(e(0xE7, uint(10000)), group(1, '<i>中文</i>\n第二行'), group(2, '坏事件')),
      ),
    ),
  )
  const reader = await open(bytes)
  const bad = await reader.cues(2).next()
  expect(() => assDialogue(bad.value!, 'S_TEXT/ASS')).toThrow()
  const good = await reader.cues(1).next()
  expect(good.value).toEqual({ start: 9.9, end: 11.4, text: '<i>中文</i>\n第二行' })
})

it('相邻 EBML 头部合并读取，缓存命中仍遵守取消', async () => {
  const bytes = fixture()
  let reads = 0
  const reader = await MatroskaSubtitles.open({
    size: bytes.length,
    read: async (start, end) => {
      reads++
      return bytes.slice(start, end)
    },
  })
  expect(reads).toBe(1)
  const abort = new AbortController()
  const cues = reader.cues(1, abort.signal)
  expect((await cues.next()).value?.text).toContain('你好')
  expect(reads).toBe(3)
  abort.abort()
  await expect(cues.next()).rejects.toThrow()
  expect(reads).toBe(3)
})

it('字幕索引直达 BlockGroup，结果与扫描一致，坏索引回退且不重复输出', async () => {
  const info = e(0x1549A966, e(0x2AD7B1, uint(1000000)))
  const tracks = e(0x1654AE6B, track(1, 'S_TEXT/UTF8'))
  const stamp = e(0xE7, uint(10000))
  const cluster = e(0x1F43B675, concat(stamp, group(1, '索引字幕')))
  const make = (relative: number, includeIndex = true) => {
    // 固定宽度位置保持 SeekHead 长度稳定。
    const seek = (position: number) =>
      e(
        0x114D9B74,
        e(
          0x4DBB,
          concat(
            e(0x53AB, new Uint8Array([0x1C, 0x53, 0xBB, 0x6B])),
            e(0x53AC, new Uint8Array([position >> 16, position >> 8, position])),
          ),
        ),
      )
    const clusterPosition = seek(0).length + info.length + tracks.length
    const index = e(
      0x1C53BB6B,
      e(
        0xBB,
        concat(
          e(0xB3, uint(9900)),
          e(
            0xB7,
            concat(e(0xF7, uint(1)), e(0xF1, uint(clusterPosition)), e(0xF0, uint(relative))),
          ),
        ),
      ),
    )
    return e(
      0x18538067,
      concat(
        seek(clusterPosition + cluster.length),
        info,
        tracks,
        cluster,
        includeIndex ? index : e(0xEC, new Uint8Array(100)),
      ),
    )
  }
  const collect = async (bytes: Uint8Array) => {
    const reader = await open(bytes)
    const cues: SubtitleCue[] = []
    for await (const cue of reader.cues(1)) cues.push(cue)
    return cues
  }
  const expected = [{ start: 9.9, end: 11.4, text: '索引字幕' }]
  expect(await collect(make(stamp.length))).toEqual(expected)
  expect(await collect(make(9999))).toEqual(expected)
  expect(await collect(make(stamp.length, false))).toEqual(expected)
})
