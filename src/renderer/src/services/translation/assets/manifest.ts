/**
 * 翻译资源清单：引擎 WASM 与各语言对的模型文件。
 *
 * 文件来自 Mozilla 的 Firefox 翻译（引擎 4.0、模型 3.0，MPL-2.0），镜像在自有存储桶，
 * 以 gzip 压缩后的普通二进制提供。`size` 与 `sha256` 都指解压后的原始文件，
 * 下载后必须校验通过才允许落盘与加载，因此这里的哈希是完整性的唯一依据：
 * 修改任何一项都要与存储桶中的文件、`vendor/README.md` 一并核对。
 */

/** 目标语言。当前只有英文，新增语言时扩展这里与 TRANSLATION_PAIRS。 */
export type TranslationTarget = 'en'

export const DEFAULT_TRANSLATION_TARGET: TranslationTarget = 'en'

/** 语言对标识：源语言固定为简体中文，繁体在送入引擎前统一转简体 */
export type TranslationPairId = `zh-Hans>${TranslationTarget}`

export type TranslationAssetKind = 'engine' | 'model' | 'lex' | 'vocab'

export interface TranslationAssetFile {
  kind: TranslationAssetKind
  /** 本机存放用的文件名，同时用作稳定标识；内容变化时必须换名，旧文件才会被视为缺失 */
  name: string
  /** 相对存储桶基址的路径，指向 gzip 压缩后的文件 */
  path: string
  /** 解压后的字节数，用于计算下载进度 */
  size: number
  /** 解压后内容的 SHA-256（小写十六进制） */
  sha256: string
}

export interface TranslationPair {
  id: TranslationPairId
  source: 'zh-Hans'
  target: TranslationTarget
  version: string
  files: readonly TranslationAssetFile[]
}

export const TRANSLATION_ENGINE: TranslationAssetFile = {
  kind: 'engine',
  name: 'engine-4.0.wasm',
  path: 'engine/4.0/bergamot-translator.wasm.gz',
  size: 4_960_506,
  sha256: 'f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926',
}

export const TRANSLATION_PAIRS: Record<TranslationPairId, TranslationPair> = {
  'zh-Hans>en': {
    id: 'zh-Hans>en',
    source: 'zh-Hans',
    target: 'en',
    version: '3.0',
    files: [
      {
        kind: 'model',
        name: 'zh-Hans-en-3.0.model.bin',
        path: 'models/zh-Hans-en/3.0/model.zhen.intgemm.alphas.bin.gz',
        size: 59_504_955,
        sha256: '3535442962ec8f4a553cc19b206befcac689ee9cddaea44fa91e21527fc30ac2',
      },
      {
        kind: 'lex',
        name: 'zh-Hans-en-3.0.lex.bin',
        path: 'models/zh-Hans-en/3.0/lex.50.50.zhen.s2t.bin.gz',
        size: 9_220_016,
        sha256: 'cdcad3592dc2bc4676c34c4d37203f7649ee989195cf083cbb60f1ea011f976b',
      },
      {
        kind: 'vocab',
        name: 'zh-Hans-en-3.0.vocab.spm',
        path: 'models/zh-Hans-en/3.0/vocab.zhen.spm.gz',
        size: 1_359_697,
        sha256: 'dff594318ab7d8b7b60b844ab98ebe6b932ae8045fab15235404c787715965b3',
      },
    ],
  },
}

export const translationPairId = (target: TranslationTarget): TranslationPairId =>
  `zh-Hans>${target}`

/** 某个目标语言需要的全部文件：引擎加该语言对的模型 */
export const listTranslationAssets = (target: TranslationTarget): TranslationAssetFile[] => [
  TRANSLATION_ENGINE,
  ...TRANSLATION_PAIRS[translationPairId(target)].files,
]

export const totalAssetSize = (files: readonly TranslationAssetFile[]): number =>
  files.reduce((sum, file) => sum + file.size, 0)

/** 由基址生成下载地址；基址末尾与路径开头的斜杠都已归一 */
export const translationAssetUrl = (base: string, file: TranslationAssetFile): string =>
  `${base.replace(/\/+$/, '')}/${file.path.replace(/^\/+/, '')}`
