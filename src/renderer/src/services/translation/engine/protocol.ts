/** 主线程与翻译 Worker 之间的消息约定 */

export interface TranslatorAssets {
  /** 引擎 WASM 与模型三件套的原始字节；初始化时转移给 Worker，主线程不再持有 */
  engine: ArrayBuffer
  model: ArrayBuffer
  lex: ArrayBuffer
  vocab: ArrayBuffer
}

export type TranslatorRequest =
  | { id: number; type: 'init'; assets: TranslatorAssets; source: string; target: string }
  | { id: number; type: 'translate'; texts: string[] }

export type TranslatorResponse =
  | { id: number; ok: true; type: 'init'; initMs: number }
  | { id: number; ok: true; type: 'translate'; texts: string[] }
  | { id: number; ok: false; message: string }
