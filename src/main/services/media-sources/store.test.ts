import type { MediaSourceRecord } from './store'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MediaSourceStore, toSummary } from './store'

const source = (patch: Partial<MediaSourceRecord> = {}): MediaSourceRecord => ({
  id: crypto.randomUUID(),
  kind: 'webdav',
  name: '家里 NAS',
  url: 'https://nas.local/dav/',
  username: 'me',
  needsLogin: false,
  createdAt: '2026-10-25T00:00:00.000Z',
  credential: { type: 'basic', password: 'secret' },
  ...patch,
})

const tempFile = async () =>
  join(await mkdtemp(join(tmpdir(), 'media-sources-')), 'media-sources.json')

describe('媒体源配置存储', () => {
  it('保存后可由新实例读回，凭证直接落盘', async () => {
    const file = await tempFile()
    const first = new MediaSourceStore(file)
    const saved = source()
    await first.save(saved)
    const second = new MediaSourceStore(file)
    expect(await second.get(saved.id)).toEqual(saved)
    expect(await first.deviceId()).toBe(await second.deviceId())
    expect(await readFile(file, 'utf8')).toContain('secret')
  })

  it('摘要不包含凭证', () => {
    expect(JSON.stringify(toSummary(source()))).not.toContain('secret')
  })

  it('并发写入按顺序生效', async () => {
    const store = new MediaSourceStore(await tempFile())
    const items = Array.from({ length: 5 }, () => source())
    await Promise.all(items.map((item) => store.save(item)))
    expect((await store.list()).map((item) => item.id)).toEqual(items.map((item) => item.id))
    await store.setNeedsLogin(items[0].id, true)
    await store.remove(items[1].id)
    expect((await store.list()).length).toBe(4)
    expect((await store.get(items[0].id))?.needsLogin).toBe(true)
  })

  it('文件损坏时降级为空列表，并保留原文件副本', async () => {
    const file = await tempFile()
    await writeFile(file, '{ broken')
    const store = new MediaSourceStore(file)
    expect(await store.list()).toEqual([])
    expect(existsSync(join(file, '..', 'media-sources.corrupt.json'))).toBe(true)
  })

  it('清除后删除文件，并重新生成设备 id', async () => {
    const file = await tempFile()
    const store = new MediaSourceStore(file)
    await store.save(source())
    const deviceId = await store.deviceId()
    await store.clear()
    expect(existsSync(file)).toBe(false)
    expect(await store.list()).toEqual([])
    expect(await store.deviceId()).not.toBe(deviceId)
  })

  it('非法记录不写盘', async () => {
    const file = await tempFile()
    const store = new MediaSourceStore(file)
    await expect(store.save(source({ url: 'not a url' }))).rejects.toBeDefined()
    expect(existsSync(file)).toBe(false)
  })
})
