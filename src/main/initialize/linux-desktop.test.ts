import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

describe('linux 桌面集成', () => {
  it('windows 与 Linux 都由已有实例接收再次打开文件的 argv', () => {
    // macOS 走 open-file；其余平台第二个进程会因单实例锁退出，文件只能经 second-instance 传回。
    expect(source).toMatch(/if \(!isMacOS\) \{\s*app\.on\('second-instance'/)
    expect(source).not.toMatch(/if \(isWindows\) \{\s*app\.on\('second-instance'/)
  })
})
