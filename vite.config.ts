import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import copy from 'rollup-plugin-copy'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const ROOT = './src/renderer'

const vite = () =>
  defineConfig({
    build: {
      outDir: resolve(__dirname, 'out/web'),
      target: 'ES2022',
      rollupOptions: {
        input: {
          main: resolve(ROOT, '/index.html'),
        },
        plugins: [
          copy({
            targets: [
              {
                src: 'node_modules/@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
                dest: 'out/web/assets',
              },
            ],
            hook: 'writeBundle',
          }),
        ],
      },
    },
    root: ROOT,
    envDir: resolve(__dirname, '.'),
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@pkg': resolve('./package.json'),
        '@renderer': resolve('src/renderer/src'),
      },
    },
    base: '/',
    server: {
      port: 1106,
      host: true,
    },
    plugins: [react()],

    define: {
      APP_NAME: JSON.stringify(packageJson.name),
    },
  })
export default vite
