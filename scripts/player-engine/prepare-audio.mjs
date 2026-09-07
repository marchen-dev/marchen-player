import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const pkg = require('@soundtouchjs/audio-worklet/package.json')
if (pkg.version !== '2.1.1') throw new Error('倍速处理资源版本不匹配')
const target = new URL('../../src/renderer/public/audio/soundtouch/2.1.1/', import.meta.url)
await mkdir(target, { recursive: true })
await copyFile(
  require.resolve('@soundtouchjs/audio-worklet/processor'),
  new URL('processor.js', target),
)
await copyFile(
  join(dirname(require.resolve('@soundtouchjs/audio-worklet/package.json')), 'LICENSE'),
  new URL('LICENSE', target),
)
console.log('音频倍速 Worklet 资源已准备')
