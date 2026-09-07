import type { WebContents } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createApplicationProtocol, createMediaLease } from './media-protocol'

it('页面导航撤销旧媒体租约，同文档路由变化保留授权', async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-protocol-'))
  const owner = Object.assign(new EventEmitter(), {
    id: 901,
    isDestroyed: () => false,
    getURL: () => 'marchen://app/index.html',
  })
  try {
    const path = join(root, '片名 # %.mkv')
    await writeFile(path, 'test-video')
    const lease = await createMediaLease(path, owner as unknown as WebContents)
    const handle = createApplicationProtocol(root)
    owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    expect((await handle(new Request(lease.url, { method: 'HEAD' }))).status).toBe(200)
    owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect((await handle(new Request(lease.url, { method: 'HEAD' }))).status).toBe(404)
  } finally {
    owner.emit('destroyed')
    await rm(root, { recursive: true })
  }
})
