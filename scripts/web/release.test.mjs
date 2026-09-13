import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { it, vi } from 'vitest'

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

it('web 与 Electron 均直连配置的 API 地址', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_API_URL', 'https://dandan-proxy.suemor.com/api/v2')
  try {
    for (const electron of [undefined, {}]) {
      vi.stubGlobal('window', { electron })
      vi.resetModules()
      const { API_URL } = await import('../../src/renderer/src/lib/env.ts')
      assert.equal(API_URL, 'https://dandan-proxy.suemor.com/api/v2')
    }
    vi.stubEnv('DEV', true)
    vi.stubGlobal('window', {})
    vi.resetModules()
    assert.equal((await import('../../src/renderer/src/lib/env.ts')).API_URL, '/api/v2')
    vi.stubGlobal('window', { electron: {} })
    vi.resetModules()
    assert.equal((await import('../../src/renderer/src/lib/env.ts')).API_URL, 'https://dandan-proxy.suemor.com/api/v2')
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  }
})
