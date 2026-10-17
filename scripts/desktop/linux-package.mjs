/** Linux 最终包校验的纯函数；文件解包与命令调用在 verify-linux.mjs。 */

/** 应用菜单与文件管理器「打开方式」至少需要这些 MIME 类型 */
export const REQUIRED_LINUX_MIME_TYPES = [
  'video/mp4',
  'video/x-matroska',
  'video/webm',
  'video/mp2t',
  'application/x-bittorrent',
]

/**
 * 桌面环境只在 hicolor 主题索引列出的尺寸目录中查找图标，标准尺寸最大到 512x512；
 * 只有 1024x1024 时 GNOME 应用网格会退回默认齿轮图标。
 */
export const REQUIRED_HICOLOR_SIZES = [48, 128, 256, 512]

const ELF_MACHINE = { 0x3E: 'x64', 0xB7: 'arm64' }

/** 读取 ELF 头中的目标架构；不是 64 位小端 ELF 时返回 null */
export function elfArch(buffer) {
  if (
    buffer.length < 20 ||
    buffer.readUInt32BE(0) !== 0x7F454C46 ||
    buffer[4] !== 2 ||
    buffer[5] !== 1
  )
    return null
  return ELF_MACHINE[buffer.readUInt16LE(18)] ?? 'unknown'
}

/**
 * 运行时会加载的原生模块：build/ 下的编译产物必定被加载；prebuilds/<platform-arch>/ 由
 * node-gyp-build 按平台选择，其他平台的预编译文件随包分发但永远不会加载，不参与架构校验。
 */
export function isLoadableNativeModule(path, arch) {
  const normalized = path.replaceAll('\\', '/')
  const prebuild = /\/prebuilds\/([^/]+)\//.exec(normalized)
  return prebuild ? prebuild[1] === `linux-${arch}` : true
}

/** dpkg 的架构名与 Node / electron-builder 的架构名不同 */
export const debArchitecture = (arch) => (arch === 'x64' ? 'amd64' : arch)

/** deb 不允许版本中出现 `-`，electron-builder 会把预发布分隔符改成 `~` */
export const debVersion = (version) => version.replaceAll('-', '~')

export function parseDesktopEntry(text) {
  const entry = {}
  let inEntry = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]'
      continue
    }
    if (!inEntry || !line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index > 0) entry[line.slice(0, index)] = line.slice(index + 1)
  }
  return entry
}

/**
 * format 为 appimage 时 Exec 应为 AppRun；不允许写死 --no-sandbox，
 * 沙箱降级只交给 AppRun 的 user namespace 探测。
 */
export function verifyDesktopEntry(entry, { executable, format }) {
  if (entry.Type !== 'Application') throw new Error('.desktop 类型无效')
  const exec = entry.Exec ?? ''
  if (!exec.endsWith(' %U')) throw new Error('.desktop Exec 缺少 %U，无法接收打开的文件')
  if (exec.includes('--no-sandbox')) throw new Error('.desktop Exec 不允许写死 --no-sandbox')
  const command = exec.split(' ')[0].replaceAll('"', '')
  if (format === 'appimage' ? command !== 'AppRun' : !command.endsWith(`/${executable}`))
    throw new Error(`.desktop Exec 入口错误：${command}`)
  if (entry.Icon !== executable) throw new Error('.desktop 图标名与可执行名不一致')
  if (entry.StartupWMClass !== executable)
    throw new Error('.desktop StartupWMClass 与 desktopName 不一致，窗口无法关联启动项')
  const mimeTypes = new Set((entry.MimeType ?? '').split(';').filter(Boolean))
  for (const type of REQUIRED_LINUX_MIME_TYPES)
    if (!mimeTypes.has(type)) throw new Error(`.desktop 缺少 MIME 类型 ${type}`)
}

/** 校验包内 hicolor 图标覆盖菜单、任务栏常用的标准尺寸 */
export function verifyHicolorIcons(paths, executable) {
  const pattern = new RegExp(`/hicolor/(\\d+)x\\1/apps/${executable}\\.png$`)
  const sizes = new Set(
    paths.map((path) => pattern.exec(path.replaceAll('\\', '/'))?.[1]).filter(Boolean).map(Number),
  )
  const missing = REQUIRED_HICOLOR_SIZES.filter((size) => !sizes.has(size))
  if (missing.length > 0)
    throw new Error(`缺少 hicolor 图标尺寸 ${missing.map((size) => `${size}x${size}`).join('、')}`)
}

/** 更新元数据必须指向本版本、本架构的 AppImage，且校验值与实际文件一致 */
export function verifyLinuxMetadata(metadata, { version, appImage }) {
  if (metadata?.version !== version) throw new Error('Linux 更新元数据版本不符')
  const file = metadata.files?.find((item) => item.url === appImage.name)
  if (!file) throw new Error(`Linux 更新元数据缺少 ${appImage.name}`)
  if (file.sha512 !== appImage.sha512 || (file.size !== undefined && file.size !== appImage.size))
    throw new Error('Linux 更新元数据校验值或长度与 AppImage 不符')
  if (metadata.path !== undefined && metadata.path !== appImage.name)
    throw new Error('Linux 更新元数据 path 指向其他文件')
}
