import { expect, it } from 'vitest'
import { verifyPackageResources } from './package-resources.mjs'
const entries = [
  '/out/renderer/wasm/libav/0.1.1/decoder.wasm',
  '/out/renderer/audio/soundtouch/2.1.1/processor.js',
  '/out/renderer/assets/subtitles-octopus-worker.wasm',
]
it.each(['/', '\\'])('最终包检查兼容路径分隔符 %s', (separator) => {
  const paths = entries.map((name) => name.replaceAll('/', separator))
  expect(() => verifyPackageResources(paths)).not.toThrow()
  expect(() => verifyPackageResources(paths.slice(1))).toThrow('缺少资源')
  for (const forbidden of ['/out/renderer/.env.production', '/out/renderer/assets/.dist.js.map']) {
    expect(() => verifyPackageResources([...paths, forbidden.replaceAll('/', separator)])).toThrow(
      '敏感文件',
    )
  }
})
