import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { readApiRouteConfig } from '../../src/renderer/src/request/api-route-config.ts'

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

it('两端读取主备环境变量，地址不再写死在请求策略中', () => {
  const source = readFileSync('src/renderer/src/request/api-route-client.ts', 'utf8')
  assert.ok(!source.includes('dandan-proxy.suemor'))
  assert.ok(readFileSync('src/renderer/src/lib/env.ts', 'utf8').includes('readApiRouteConfig(import.meta.env)'))
})

it('两条线路都必填，合法 HTTPS 地址保留对应身份并移除末尾斜杠', () => {
  const config = { VITE_API_CLOUDFLARE_URL: ' https://cf.example.com/api/v2/ ', VITE_API_EDGEONE_URL: 'https://eo.example.com/api/v2' }
  assert.deepEqual(readApiRouteConfig(config), { cloudflare: 'https://cf.example.com/api/v2', edgeone: 'https://eo.example.com/api/v2' })
  for (const key of Object.keys(config)) {
    assert.throws(() => readApiRouteConfig({ ...config, [key]: '' }), new RegExp(key))
    for (const value of ['bad-url', 'http://insecure.example.com/api/v2', 'https://example.com/api/v2?x=1', 'https://example.com/api/v2#x']) {
      assert.throws(() => readApiRouteConfig({ ...config, [key]: value }), new RegExp(key))
    }
  }
})
