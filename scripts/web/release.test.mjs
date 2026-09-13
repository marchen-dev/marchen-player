import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { onRequest } from '../../functions/api/v2/[[path]].js'

it('缺少正式配置时在构建和上传之前失败，不输出秘密值', () => {
  const env = { ...process.env, SENTRY_AUTH_TOKEN: 'test-secret-never-print', VITE_SENTRY_DSN: '', VITE_POSTHOG_KEY: '' }
  const result = spawnSync(process.execPath, ['scripts/web/release-build.mjs'], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /缺少发布变量/)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(env.SENTRY_AUTH_TOKEN))
})

it('edgeOne 只发布 out/web，所有资源声明相同 COEP，HashRouter 不吞掉缺失资源', () => {
  const config = JSON.parse(readFileSync('edgeone.json', 'utf8'))
  assert.equal(config.outputDirectory, 'out/web')
  assert.equal(config.rewrites, undefined)
  assert.ok(config.headers.find(rule => rule.source === '/*').headers.some(header => header.key === 'Cross-Origin-Embedder-Policy' && header.value === 'credentialless'))
})

it('aPI 固定上游、保留查询与请求体，不转发 Cookie，错误状态不伪装成功', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url.origin, 'https://dandan-proxy.suemor.com')
      assert.equal(url.pathname, '/api/v2/match')
      assert.equal(url.search, '?mode=test')
      assert.equal(init.method, 'POST')
      assert.equal(init.headers.get('cookie'), null)
      assert.equal(await new Response(init.body).text(), '{"test":true}')
      return Response.json({ error: 'limited' }, { status: 429 })
    }
    const response = await onRequest({ request: new Request('https://preview.example/api/v2/match?mode=test', { method: 'POST', headers: { cookie: 'private=1', 'content-type': 'application/json' }, body: '{"test":true}' }) })
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    globalThis.fetch = async () => { throw new Error('network') }
    assert.equal((await onRequest({ request: new Request('https://preview.example/api/v2/search') })).status, 502)
  } finally { globalThis.fetch = original }
})
