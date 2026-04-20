import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@pkg': resolve('./package.json'),
        '@marchen/electron-ipc': resolve('packages/electron-ipc/src'),
        '@marchen/shared': resolve('packages/shared/src'),
      },
    },
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@pkg': resolve('./package.json'),
        '@marchen/electron-ipc': resolve('packages/electron-ipc/src'),
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
          },
        ],
      }),
    ],
    define: {
      APP_NAME: JSON.stringify(packageJson.name),
    },
    server: {
      host: '0.0.0.0',
    },
  },
})
