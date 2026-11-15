/**
 * 当前环境能否运行弹幕翻译。任一条件不满足时功能显示为「不支持」，弹幕照常按原文显示。
 */
import { isAssetStoreSupported } from './assets/store'

export type TranslationUnsupportedReason =
  /** 构建时没有配置翻译资源基址 */
  | 'not_configured'
  /** 引擎的整数矩阵运算依赖 WASM SIMD，没有非 SIMD 版本 */
  | 'no_wasm_simd'
  | 'no_worker'
  /** 资源以 gzip 文件提供，需要浏览器自带的流式解压 */
  | 'no_decompression'
  /** 没有可用的本机存储（OPFS） */
  | 'no_storage'

export interface TranslationSupportEnvironment {
  assetsBase: string | null
  hasWasmSimd: () => boolean
  hasWorker: () => boolean
  hasDecompression: () => boolean
  hasStorage: () => boolean
}

/** 一个只含 v128 常量运算的最小模块，能通过校验即说明支持 WASM SIMD */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
])

export const browserSupportEnvironment = (
  assetsBase: string | null,
): TranslationSupportEnvironment => ({
  assetsBase,
  hasWasmSimd: () => typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE),
  hasWorker: () => typeof Worker === 'function',
  hasDecompression: () => typeof DecompressionStream === 'function',
  hasStorage: isAssetStoreSupported,
})

/** 返回不支持的原因；支持时返回 null */
export const detectUnsupportedReason = (
  environment: TranslationSupportEnvironment,
): TranslationUnsupportedReason | null => {
  if (!environment.assetsBase) return 'not_configured'
  if (!environment.hasWorker()) return 'no_worker'
  if (!environment.hasWasmSimd()) return 'no_wasm_simd'
  if (!environment.hasDecompression()) return 'no_decompression'
  if (!environment.hasStorage()) return 'no_storage'
  return null
}
