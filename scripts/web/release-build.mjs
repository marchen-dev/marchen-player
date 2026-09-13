import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const required = ['VITE_API_URL', 'VITE_SENTRY_DSN', 'VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'MARCHEN_DEPLOY_ENV']
try {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Web 发布要求 Node 24')
  const missing = required.filter(key => !process.env[key]?.trim())
  if (missing.length) throw new Error(`缺少发布变量：${missing.join(', ')}`)
  const environment = process.env.MARCHEN_DEPLOY_ENV
  if (!['preview', 'production'].includes(environment)) throw new Error('MARCHEN_DEPLOY_ENV 必须是 preview 或 production')
  if (process.env.VITE_API_URL.replace(/\/$/, '') !== 'https://dandan-proxy.suemor.com/api/v2')
    throw new Error('VITE_API_URL 与 EdgeOne 固定 API 上游不一致，请同步修改 edge-functions/api/v2')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const release = `Marchen@${pkg.version}+${commit}`
  const dist = environment === 'production' ? 'web' : 'web-preview'
  const env = { ...process.env, MARCHEN_COMMIT: commit, SENTRY_RELEASE: release, MARCHEN_DIST: dist, MARCHEN_ENVIRONMENT: environment }
  const run = args => execFileSync('pnpm', args, { cwd: root, env, stdio: 'inherit' })
  run(['typecheck'])
  run(['lint'])
  run(['test:player-runtime'])
  run(['exec', 'vitest', 'run', '--config', 'vitest.main.config.ts', 'src/main/build/telemetry-metadata.test.ts', 'scripts/web/release.test.mjs'])
  run(['build:web'])
  execFileSync(process.execPath, ['scripts/verify-observability-build.mjs', '--root', 'out/web', '--target', 'web', '--expected-release', release, '--expected-dist', dist, '--require-no-maps'], { cwd: root, env, stdio: 'inherit' })
  for (const path of ['assets/subtitles-octopus-worker.wasm', 'wasm/libav/0.1.1/manifest.json', 'audio/soundtouch/2.1.1/processor.js'])
    if (!statSync(resolve(root, 'out/web', path))) throw new Error(`缺少运行资源：${path}`)
  const assets = readdirSync(resolve(root, 'out/web/assets'))
  if (!assets.some(name => /^subtitles-octopus-worker-.*\.js$/.test(name))) throw new Error('缺少字幕 Worker')
  console.log(`[web-release] 检查通过：${release}, ${dist}；构建不登记 production deploy，实际发布由 EdgeOne 完成。`)
} catch (error) {
  console.error(`[web-release] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
