import {
  assertPersistentMediaPath,
  isForbiddenPersistentMediaPath,
} from '@renderer/database/persistence/media-path'
import { describe, expect, it } from 'vitest'

describe('hISTORY 媒体路径持久化边界', () => {
  it.each([
    'marchen:///video.mkv',
    'blob:renderer-object-url',
    'http://127.0.0.1:3210/v1/media/token/g/1/index.m3u8',
    'http://localhost:3210/video.mp4',
    'file:///Users/test/video.mkv',
  ])('拒绝临时播放地址：%s', (value) => {
    expect(isForbiddenPersistentMediaPath(value)).toBe(true)
    expect(() =>
      assertPersistentMediaPath({
        source: { kind: 'electron-file', path: value, name: 'video.mkv', size: 1 },
      }),
    ).toThrow('原始文件路径')
  })

  it.each(['/Users/test/video.mkv', 'C:\\Media\\video.mkv', '\\\\server\\share\\video.mkv'])(
    '允许原始文件路径：%s',
    (value) =>
      expect(() =>
        assertPersistentMediaPath({
          source: { kind: 'electron-file', path: value, name: 'video.mkv', size: 1 },
        }),
      ).not.toThrow(),
  )

  it('新存储不接受旧协议记录', () => {
    expect(() =>
      assertPersistentMediaPath({
        source: {
          kind: 'electron-file',
          path: 'marchen://ambiguous-video.mkv',
          name: 'video.mkv',
          size: 1,
        },
      }),
    ).toThrow()
  })
})
