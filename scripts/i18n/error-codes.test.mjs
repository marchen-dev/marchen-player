// 错误码与文案的对应检查。
//
// `UserError` 的错误码是普通字符串，类型系统管不到「这个码有没有文案」。这里扫描源码：
//   1. 每个 `new UserError('域.原因', …)` 的错误码，以及结果对象 / 编码内容里写成
//      `code: '域.原因'` 的错误码，errors 命名空间的简体中文里必须有同名的键
//      （英文是否齐全由 packages/i18n/tests/parity.test.ts 保证）；
//   2. 错误码必须写成字面量，否则这里查不到；
//   3. 反过来，errors 里的错误码必须有地方在用，避免留下没人抛出的文案。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import errors from '../../packages/i18n/src/locales/zh-CN/errors.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const SOURCE_DIRS = ['src/main', 'src/renderer/src', 'packages']
const SKIP = /node_modules|\/tests\/|\.test\.|\/vendor\/|^packages\/i18n\/|\/dist\/|\.d\.ts$/

/**
 * 这些域的错误码不是由 `new UserError` 抛出的，而是已有的错误类型或结果对象上的 `code`，
 * 显示时由 describeError 的 `domain` 映射过来。它们的完整性由各自的类型保证，不参与反向检查。
 * 新增域时在这里登记并说明来源。
 */
const MAPPED_DOMAINS = new Set([
  // 各类操作的概括说明，不是错误码
  'generic',
  // 媒体源：MediaSourceError 与 IPC 结果对象上的 code（packages/shared/src/media-sources）
  'mediaSource',
  // 弹幕翻译的资源下载：TranslationAssetError 的 code（services/translation/assets/download.ts）
  'translation',
  // 播放内核：PlaybackError 的 code（packages/playback-core）
  'playback',
  // 图片字幕：PgsSessionError 的 code（services/media/subtitles/pgs）
  'pgs',
  // 外挂字幕导入：SubtitleError 的 code（packages/shared/src/media）
  'subtitle',
  // 打开本地视频：主进程 ipc/player.ts 返回的结果对象上的 code
  'videoImport',
  // 打开网络视频：RemoteMediaError 的 code（packages/shared/src/media/remote.ts）
  'remoteMedia',
  // 本地弹幕文件：LocalDanmakuValidationError 与 LocalDanmakuImportError 的 code；
  // 读取 / 保存失败由 services/danmaku/local-import.ts 抛出 UserError
  'localDanmaku',
])

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path)
    return /\.(?:ts|tsx)$/.test(name) ? [path] : []
  })

const LITERAL = /new UserError\(\s*(['"`])([\w.-]+)\1/g
/**
 * 不经过 `new UserError` 的写法：失败结果对象 `{ ok: false, code: '域.原因', message }` 与
 * `encodeUserError({ code: '域.原因', message })`。只认带域前缀的码，裸错误码属于 MAPPED_DOMAINS。
 */
const OBJECT_CODE = /\bcode:\s*(['"`])([a-z][\w-]*\.[\w.-]+)\1/gi
const ANY = /new UserError\(\s*(\S)/g

const used = new Map()
const nonLiteral = []
for (const dir of SOURCE_DIRS) {
  for (const path of walk(join(ROOT, dir))) {
    const file = relative(ROOT, path)
    if (SKIP.test(file)) continue
    const source = readFileSync(path, 'utf8')
    for (const pattern of [LITERAL, OBJECT_CODE]) {
      for (const match of source.matchAll(pattern)) {
        used.set(match[2], [...(used.get(match[2]) ?? []), file])
      }
    }
    for (const match of source.matchAll(ANY)) {
      // 定义 UserError 的那个文件里出现的是类型与文档，不算调用
      if (!/['"`]/.test(match[1]) && !file.endsWith('shared/src/errors/index.ts'))
        nonLiteral.push(file)
    }
  }
}

/** 取出文案对象里的全部叶子键（去掉单复数后缀），形如 `域.原因` */
const leafKeys = (value, prefix = '') =>
  typeof value === 'string'
    ? [prefix.replace(/_(?:zero|one|two|few|many|other)$/, '')]
    : Object.entries(value).flatMap(([key, child]) =>
        leafKeys(child, prefix ? `${prefix}.${key}` : key),
      )

const defined = new Set(leafKeys(errors))

describe('错误码与文案对应', () => {
  it('错误码都写成字面量', () => {
    expect([...new Set(nonLiteral)]).toEqual([])
  })

  it('代码里用到的错误码都有文案', () => {
    const missing = [...used.entries()]
      .filter(([code]) => !defined.has(code))
      .map(([code, files]) => `${code}（${[...new Set(files)].join('、')}）`)
    expect(missing).toEqual([])
  })

  it('文案里的错误码都有地方在用', () => {
    const unused = [...defined].filter(
      (code) => !MAPPED_DOMAINS.has(code.split('.')[0]) && !used.has(code),
    )
    expect(unused).toEqual([])
  })
})
