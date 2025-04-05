import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import copy from 'rollup-plugin-copy'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@renderer': resolve('src/renderer/src'),
        '@pkg': resolve('./package.json'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@main': resolve('src/main'),
        '@pkg': resolve('./package.json'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        plugins: [
          copy({
            targets: [
              {
                src: 'node_modules/@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
                dest: 'out/renderer/assets',
              },
            ],
            hook: 'writeBundle',
          }) as any,
        ],
      },
    },
    define: {
      APP_NAME: JSON.stringify(packageJson.name),
    },
    server: {
      host: '0.0.0.0',
    },
  },
})
