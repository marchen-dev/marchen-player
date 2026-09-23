/** ASAR 清单使用宿主系统分隔符，检查前统一路径，避免 Windows 漏检。 */
export function verifyPackageResources(entries) {
  const paths = entries.map((name) => name.replaceAll('\\', '/'))
  for (const token of [
    '/wasm/libav/0.1.1/',
    '/audio/soundtouch/2.1.1/processor.js',
    'subtitles-octopus-worker.wasm',
  ]) {
    if (!paths.some((name) => name.includes(token))) throw new Error(`安装包缺少资源：${token}`)
  }
  if (paths.some((name) => /\.map$|\/\.env(?:\.|$)/.test(name)))
    throw new Error('安装包含构建敏感文件或 Source Map')
}
