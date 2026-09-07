import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { createSentryBuildPlugin } from './src/main/build/sentry-vite'
import {
  createTelemetryDefine,
  resolveTelemetryBuildMetadata,
} from './src/main/build/telemetry-metadata'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))
const metadata = resolveTelemetryBuildMetadata({
  target: 'electron',
  version: packageJson.version,
  mode: process.env.NODE_ENV ?? 'development',
})
const telemetryDefine = createTelemetryDefine(metadata)
const sentryPlugin = (output: 'main' | 'preload' | 'renderer') =>
  createSentryBuildPlugin({
    metadata,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    assets: `out/${output}/**/*.{js,mjs,cjs,map}`,
    mapsToDelete: `out/${output}/**/*.map`,
  })

export default defineConfig({
  main: {
    build: { sourcemap: 'hidden' },
    plugins: [sentryPlugin('main')],
    define: telemetryDefine,
    optimizeDeps: {
      include: ['mediabunny', '@mediabunny/ac3', '@mediabunny/dts', '@soundtouchjs/audio-worklet'],
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@pkg': resolve('./package.json'),
        '@marchen/electron-ipc': resolve('packages/electron-ipc/src'),
        '@marchen/danmaku-engine': resolve('packages/danmaku-engine/src'),
        '@marchen/shared': resolve('packages/shared/src'),
      },
    },
  },
  preload: {
    build: { sourcemap: 'hidden' },
    plugins: [sentryPlugin('preload')],
    define: telemetryDefine,
  },
  renderer: {
    optimizeDeps: {
      include: ['mediabunny', '@mediabunny/ac3', '@mediabunny/dts', '@soundtouchjs/audio-worklet'],
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@pkg': resolve('./package.json'),
        '@marchen/electron-ipc': resolve('packages/electron-ipc/src'),
        '@marchen/danmaku-engine': resolve('packages/danmaku-engine/src'),
        '@marchen/shared': resolve('packages/shared/src'),
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
            rename: { stripBase: true },
          },
        ],
      }),
      sentryPlugin('renderer'),
    ],
    build: { sourcemap: 'hidden' },
    define: {
      APP_NAME: JSON.stringify(packageJson.name),
      ...telemetryDefine,
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      host: '0.0.0.0',
    },
  },
})
