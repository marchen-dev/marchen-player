import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { RELEASE_REPOSITORY } from '../../packages/shared/src/update-policy.ts'
import { assertChannelAdvance, buildChannelFeeds } from './channel-feeds.mjs'

const publish = process.argv.includes('--publish')
const destination = resolve('.tmp/channel-feeds')
const token = process.env.GH_TOKEN
if (!token) throw new Error('需要 GH_TOKEN 读取发布列表')
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== RELEASE_REPOSITORY)
  throw new Error('只允许目标仓库更新渠道')
const apiBase = `https://api.github.com/repos/${RELEASE_REPOSITORY}`
async function api(path, method = 'GET', body, allowMissing = false) {
  const response = await fetch(apiBase + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  })
  if (allowMissing && response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub ${method} ${path}：${response.status}`)
  return response.json()
}
const releases = []
for (let page = 1; ; page++) {
  const batch = await api(`/releases?per_page=100&page=${page}`)
  releases.push(...batch)
  if (batch.length < 100) break
}
const files = await buildChannelFeeds(releases, async (asset) => {
  // 不向下载域名传递 GitHub 凭据；公开发行必须可匿名下载。
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`元数据下载失败：${asset.name} ${response.status}`)
  if (asset.size > 2 * 1024 * 1024) throw new Error('更新元数据超过大小限制')
  const text = await response.text()
  if (Buffer.byteLength(text) !== asset.size) throw new Error('元数据下载长度不符')
  return text
})
// 先在内存验证全部输出，再写预览。没有 --publish 时绝不修改远端。
for (const [name, text] of Object.entries(files)) {
  await mkdir(dirname(join(destination, name)), { recursive: true })
  await writeFile(join(destination, name), text)
}
if (!publish) {
  console.log(`渠道源预览已生成：${destination}`)
} else {
  const ref = await api('/git/ref/heads/update-feeds', 'GET', undefined, true)
  const parent = ref ? await api(`/git/commits/${ref.object.sha}`) : null
  if (ref) {
    const previousFile = await api(
      `/contents/channels.json?ref=${ref.object.sha}`,
      'GET',
      undefined,
      true,
    )
    if (previousFile) {
      const previous = JSON.parse(Buffer.from(previousFile.content, 'base64').toString())
      const next = JSON.parse(files['channels.json'])
      assertChannelAdvance(previous, next)
    }
  }
  const tree = await api('/git/trees', 'POST', {
    tree: Object.entries(files).map(([path, content]) => ({
      path,
      mode: '100644',
      type: 'blob',
      content,
    })),
  })
  if (parent?.tree.sha === tree.sha) {
    console.log('渠道元数据未改变，无需提交')
  } else {
    const commit = await api('/git/commits', 'POST', {
      message: 'chore(release): synchronize update channels',
      tree: tree.sha,
      parents: ref ? [ref.object.sha] : [],
    })
    if (ref) await api('/git/refs/heads/update-feeds', 'PATCH', { sha: commit.sha, force: false })
    else await api('/git/refs', 'POST', { ref: 'refs/heads/update-feeds', sha: commit.sha })
    console.log('三个渠道已在同一个提交中发布')
  }
}
