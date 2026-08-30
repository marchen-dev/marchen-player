import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { createSentryBuildPlugin } from './src/main/build/sentry-vite'
import {
  createTelemetryDefine,
  resolveTelemetryBuildMetadata,
} from './src/main/build/telemetry-metadata'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const ROOT = './src/renderer'

const vite = ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiProxyOrigin = new URL(env.VITE_API_URL).origin
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
      port: 1106,
      host: true,
      proxy: {
        '/api/v2': {
          target: apiProxyOrigin,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        '/api/v2': {
          target: apiProxyOrigin,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      viteStaticCopy({
        targets: [
          {
            src: '../../node_modules/@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
            dest: 'assets',
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
        assets: 'out/web/**/*.{js,mjs,cjs,map}',
        mapsToDelete: 'out/web/**/*.map',
      }),
    ],

    define: {
      APP_NAME: JSON.stringify(packageJson.name),
      ...telemetryDefine,
    },
  })
}
export default vite
