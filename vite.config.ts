import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { mediaIsolationPlugin } from './src/main/build/media-isolation'
import { createSentryBuildPlugin } from './src/main/build/sentry-vite'
import {
  createTelemetryDefine,
  resolveTelemetryBuildMetadata,
} from './src/main/build/telemetry-metadata'
import { readApiRouteConfig } from './src/renderer/src/request/api-route-config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const ROOT = './src/renderer'

const vite = ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, __dirname, '')
  readApiRouteConfig(env)
  const telemetryDefine = createTelemetryDefine(
    resolveTelemetryBuildMetadata({ target: 'web', version: packageJson.version, mode }),
  )

  return defineConfig({
    build: {
      outDir: resolve(__dirname, 'out/web'),
      target: 'esnext',
      sourcemap: 'hidden',
      rollupOptions: {
        input: {
          main: resolve(ROOT, '/index.html'),
        },
      },
    },
    root: ROOT,
    envDir: resolve(__dirname, '.'),
    optimizeDeps: {
      include: ['mediabunny', '@mediabunny/ac3', '@mediabunny/dts', '@soundtouchjs/audio-worklet'],
    },
    resolve: {
      alias: {
        '@pkg': resolve('./package.json'),
        '@renderer': resolve('src/renderer/src'),
        '@marchen/electron-ipc': resolve('packages/electron-ipc/src'),
        '@marchen/danmaku-engine': resolve('packages/danmaku-engine/src'),
        '@marchen/shared': resolve('packages/shared/src'),
      },
    },
    base: '/',
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      port: 1106,
      host: true,
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    plugins: [
      {
        name: 'marchen-web-indexing',
        // 只有正式部署可被索引；开发和未声明环境的本地构建也保守禁用。
        // 仅在 Web 构建注册，避免向共享 HTML 写入永久 noindex。
        transformIndexHtml: () =>
          env.MARCHEN_DEPLOY_ENV === 'production'
            ? []
            : [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }],
      },
      mediaIsolationPlugin(),
      tailwindcss(),
      react(),
      viteStaticCopy({
        targets: [
          {
            src: '../../node_modules/@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
            dest: 'assets',
            rename: { stripBase: true },
          },
        ],
      }),
      createSentryBuildPlugin({
        metadata: resolveTelemetryBuildMetadata({
          target: 'web',
          version: packageJson.version,
          mode,
        }),
        authToken: env.SENTRY_AUTH_TOKEN,
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        // Vite 可能生成 .dist-*.js；glob 默认跳过点开头文件，上传与清理必须同时覆盖。
        assets: 'out/web/**/{*,.*}.{js,mjs,cjs,map}',
        mapsToDelete: 'out/web/**/{*,.*}.map',
      }),
    ],

    define: {
      APP_NAME: JSON.stringify(packageJson.name),
      ...telemetryDefine,
    },
  })
}
export default vite
