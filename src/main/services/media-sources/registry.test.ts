import type { MediaSourceInput } from '@marchen/shared/media-sources'
import type { MediaSourceProvider, ProviderFactories, ProviderFactory } from './provider'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { describe, expect, it, vi } from 'vitest'
import { errorForStatus } from './errors'
import { MediaSourceRegistry } from './registry'
import { MediaSourceStore } from './store'

const input: MediaSourceInput = {
  kind: 'webdav',
  name: ' 家里 NAS ',
  url: 'https://nas.local/dav',
  username: 'me',
  password: 'secret',
}

async function setup(
  connect: ProviderFactory['connect'] = async ({ url, password }) => ({
    url: `${url}/`,
    credential: { type: 'basic', password },
  }),
) {
  const store = new MediaSourceStore(join(await mkdtemp(join(tmpdir(), 'registry-')), 'm.json'))
  const browse = vi.fn<MediaSourceProvider['browse']>(async () => ({ title: 'root', nodes: [] }))
  const create = vi.fn((): MediaSourceProvider => ({
    origin: 'https://nas.local',
    authHeaders: () => ({}),
    browse,
    resolvePlayback: vi.fn(),
    siblings: vi.fn(),
    subtitles: vi.fn(),
    readSubtitle: vi.fn(),
  }))
  const factory: ProviderFactory = { connect: vi.fn(connect), create }
  const factories: ProviderFactories = { webdav: factory, jellyfin: factory, emby: factory }
  return { store, registry: new MediaSourceRegistry(store, factories), factory, browse, create }
}

describe('媒体源注册表', () => {
  it('连接测试通过后才保存，摘要不含凭证', async () => {
    const { registry } = await setup()
    const summary = await registry.add(input)
    expect(summary).toMatchObject({
      name: '家里 NAS',
      url: 'https://nas.local/dav/',
      needsLogin: false,
    })
    expect(JSON.stringify(await registry.list())).not.toContain('secret')
  })

  it('连接失败时不保存，并映射为稳定错误码', async () => {
    const { registry } = await setup(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(registry.add(input)).rejects.toMatchObject({ code: 'unreachable' })
    expect(await registry.list()).toEqual([])
  })

  it('只改名称不重新测试；改地址必须带密码', async () => {
    const { registry, factory } = await setup()
    const { id, url } = await registry.add(input)
    vi.mocked(factory.connect).mockClear()
    await registry.update(id, { ...input, url, name: '新名字', password: '' })
    expect(factory.connect).not.toHaveBeenCalled()
    expect((await registry.list())[0].name).toBe('新名字')
    await expect(
      registry.update(id, { ...input, url: 'https://other.local/', password: '' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('401 标记需要重新登录，之后不再请求服务器，重新登录后恢复', async () => {
    const { registry, browse } = await setup()
    const { id } = await registry.add(input)
    const invalidated = vi.fn()
    registry.onInvalidate(invalidated)
    browse.mockRejectedValueOnce(new MediaSourceError('auth_failed'))
    await expect(registry.use(id, (p) => p.browse(null))).rejects.toMatchObject({
      code: 'auth_failed',
    })
    expect((await registry.list())[0].needsLogin).toBe(true)
    expect(invalidated).toHaveBeenCalledWith(id)
    browse.mockClear()
    await expect(registry.use(id, (p) => p.browse(null))).rejects.toMatchObject({
      code: 'auth_failed',
    })
    expect(browse).not.toHaveBeenCalled()
    await registry.relogin(id, 'secret')
    await expect(registry.use(id, (p) => p.browse(null))).resolves.toBeDefined()
  })

  it('403 只是该项无权限：不标记重新登录，也不撤销播放租约', async () => {
    const { registry, browse } = await setup()
    const { id } = await registry.add(input)
    const invalidated = vi.fn()
    registry.onInvalidate(invalidated)
    browse.mockRejectedValueOnce(errorForStatus(403))
    await expect(registry.use(id, (p) => p.browse('/private'))).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect((await registry.list())[0].needsLogin).toBe(false)
    expect(invalidated).not.toHaveBeenCalled()
  })

  it('重新登录后，旧凭证请求晚到的 401 不会把来源重新标记为失效', async () => {
    const { registry, browse } = await setup()
    const { id } = await registry.add(input)
    let rejectStale!: (error: unknown) => void
    browse.mockImplementationOnce(() => new Promise((_, reject) => (rejectStale = reject)))
    const stale = registry.use(id, (p) => p.browse(null))
    await vi.waitFor(() => expect(browse).toHaveBeenCalledOnce())
    await registry.relogin(id, 'secret')
    const invalidated = vi.fn()
    registry.onInvalidate(invalidated)
    rejectStale(new MediaSourceError('auth_failed'))
    await expect(stale).rejects.toMatchObject({ code: 'auth_failed' })
    expect((await registry.list())[0].needsLogin).toBe(false)
    expect(invalidated).not.toHaveBeenCalled()
  })

  it('移除后访问返回来源已移除，并通知清理', async () => {
    const { registry } = await setup()
    const { id } = await registry.add(input)
    const invalidated = vi.fn()
    registry.onInvalidate(invalidated)
    await registry.remove(id)
    expect(invalidated).toHaveBeenCalledWith(id)
    await expect(registry.use(id, (p) => p.browse(null))).rejects.toMatchObject({
      code: 'source_removed',
    })
  })

  it('清除全部来源', async () => {
    const { registry } = await setup()
    await registry.add(input)
    const invalidated = vi.fn()
    registry.onInvalidate(invalidated)
    await registry.clear()
    expect(invalidated).toHaveBeenCalledWith(undefined)
    expect(await registry.list()).toEqual([])
  })
})
