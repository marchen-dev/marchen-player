import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const ROOT = './src/renderer'

const vite = () =>
  defineConfig({
    build: {
      outDir: resolve(__dirname, 'out/web'),
      target: 'esnext',
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
        '@marchen/shared': resolve('packages/shared/src'),
      },
    },
    base: '/',
    server: {
      port: 1106,
      host: true,
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
    ],

    define: {
      APP_NAME: JSON.stringify(packageJson.name),
    },
  })
export default vite
