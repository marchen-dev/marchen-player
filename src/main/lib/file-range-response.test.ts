import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fileRangeResponse } from './file-range-response'

it('hEAD、完整 GET、范围、后缀、无效范围和文件变化', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marchen-range-'))
  try {
    const path = join(dir, '空 格#%.mkv')
    await writeFile(path, '0123456789')
    const request = (method = 'GET', headers: Record<string, string> = {}) =>
      fileRangeResponse(
        path,
        new Request('https://app/media', { method, headers }),
        'video/x-matroska',
      )
    const head = await request('HEAD')
    expect(head.headers.get('Content-Length')).toBe('10')
    expect(await head.text()).toBe('')
    expect(await (await request()).text()).toBe('0123456789')
    expect(await (await request('GET', { Range: 'bytes=2-4' })).text()).toBe('234')
    expect(await (await request('GET', { Range: 'bytes=-3' })).text()).toBe('789')
    expect(await (await request('GET', { Range: 'bytes=8-99' })).text()).toBe('89')
    for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=0-1,3-4', 'bytes=-0', 'garbage'])
      expect((await request('GET', { Range: range })).status).toBe(416)
    await writeFile(path, 'changed-size')
    expect((await request('GET', { 'If-Match': head.headers.get('ETag')! })).status).toBe(412)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
