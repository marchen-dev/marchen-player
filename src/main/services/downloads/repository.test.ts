import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { safeTaskPath, validateTorrentPath } from './paths'
import { DownloadRepository } from './repository'
const dirs: string[] = []
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), 'marchen-downloads-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
describe('下载仓库', () => {
  it('串行保存与损坏主文件备份恢复', async () => {
    const dir = await temp()
    const repo = new DownloadRepository(dir)
    const data = await repo.load('/downloads')
    await Promise.all([
      repo.save(data),
      repo.save({ ...data, settings: { ...data.settings, policy: 'stop' } }),
    ])
    expect((await repo.load('')).settings.policy).toBe('stop')
    await writeFile(join(dir, 'tasks.json'), '{broken')
    expect((await repo.load('')).settings.policy).toBe('ratio-or-time')
    expect(await readFile(join(dir, 'tasks.json'), 'utf8')).toBe('{broken')
  })
  it('未知版本不静默清空', async () => {
    const dir = await temp()
    await writeFile(join(dir, 'tasks.json'), '{"schemaVersion":999}')
    await expect(new DownloadRepository(dir).load('')).rejects.toThrow('版本不兼容')
  })
  it.each(['../x', '/root', 'C:/x', 'a/../x', 'a\\x', 'CON.mkv', 'a/b.', 'a//b'])(
    '拒绝危险路径 %s',
    (value) => expect(() => validateTorrentPath(value)).toThrow(),
  )
  it('拒绝符号链接并允许正常文件', async () => {
    const dir = await temp()
    const outside = await temp()
    await symlink(outside, join(dir, 'link'))
    await expect(safeTaskPath(dir, 'link/video.mkv')).rejects.toThrow('符号链接')
    expect(await safeTaskPath(dir, '普通/第01集.mkv')).toBe(
      join(await realpath(dir), '普通/第01集.mkv'),
    )
  })
})
