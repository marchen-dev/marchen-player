/**
 * 本地视频入口允许的容器后缀，对齐 MediaBunny 的视频容器读取能力。
 * 后缀只用于文件筛选，实际容器、轨道和解码能力仍由播放内核探测。
 * 新增时同步 electron-builder.yml 的系统文件关联；音频与 HLS 播放列表不在此列。
 */
export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mov', 'qt', 'mkv', 'mk3d', 'webm', 'ts', 'mts', 'm2ts', 'm2t',
] as const

export const VIDEO_FILE_ACCEPT = VIDEO_EXTENSIONS.map((extension) => `.${extension}`).join(',')
const videoExtensions = new Set<string>(VIDEO_EXTENSIONS)

export function isVideoFile(filePath: string): boolean {
  const name = filePath.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 && videoExtensions.has(name.slice(dot + 1).toLowerCase())
}
