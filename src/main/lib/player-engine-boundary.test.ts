import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 防止删除后又把旧播放转码入口或原生二进制接回发布产物。 */
describe('播放内核的进程边界', () => {
  it('仅保留浏览器解码依赖和受控文件读取，不启动旧 HLS 服务', () => {
    const root = resolve('.')
    for (const path of ['src/main/ipc/media.ts', 'src/main/lib/ffmpeg.ts'])
      expect(existsSync(resolve(root, path))).toBe(false)
    for (const path of ['src/main/modules/media-gateway', 'src/main/modules/ffmpeg']) {
      const directory = resolve(root, path)
      if (existsSync(directory)) expect(readdirSync(directory, { recursive: true })).toEqual([])
    }
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['hls.js']).toBeUndefined()
    expect(pkg.dependencies['@suemor/libav-hevc']).toBe('0.1.1')
    const packaging = readFileSync(resolve(root, 'electron-builder.yml'), 'utf8')
    expect(packaging).toContain('!resources/ffmpeg/**')
  })
})
