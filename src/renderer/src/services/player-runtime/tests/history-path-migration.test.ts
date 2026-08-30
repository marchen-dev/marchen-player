import { migrateLegacyHistoryPath } from '@renderer/database/migrations/media-path'
import { describe, expect, it } from 'vitest'

describe('hISTORY v5 媒体路径迁移', () => {
  it('恢复 macOS 绝对路径并解码特殊字符', () => {
    expect(
      migrateLegacyHistoryPath('marchen:///Users/test/%E8%A7%86%20%E9%A2%91.mkv', 'darwin'),
    ).toEqual({
      status: 'ready',
      path: '/Users/test/视 频.mkv',
      migrated: true,
    })
  })

  it.each([
    ['marchen://C:\\Media\\video.mkv', 'C:\\Media\\video.mkv'],
    ['marchen://c/Media/video.mkv', 'C:\\Media\\video.mkv'],
    ['marchen://server/share/video.mkv', '\\\\server\\share\\video.mkv'],
    ['marchen://c/Media/season/../video.mkv', 'C:\\Media\\video.mkv'],
  ])('恢复 Windows 盘符和 UNC：%s', (value, expected) => {
    expect(migrateLegacyHistoryPath(value, 'win32')).toMatchObject({
      status: 'ready',
      path: expected,
      migrated: true,
    })
  })

  it('纯 Renderer 实现仍会规范化 macOS 点路径', () => {
    expect(migrateLegacyHistoryPath('marchen:///Users/test/season/../video.mkv', 'darwin')).toEqual(
      {
        status: 'ready',
        path: '/Users/test/video.mkv',
        migrated: true,
      },
    )
  })

  it('歧义路径保留原记录并附带诊断状态', () => {
    const value = 'marchen://relative-video.mkv'
    expect(migrateLegacyHistoryPath(value, 'darwin')).toMatchObject({
      status: 'unresolved',
      path: value,
      originalPath: value,
    })
  })
})
