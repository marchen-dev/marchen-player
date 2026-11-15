/// <reference lib="webworker" />
/**
 * 翻译 Worker：在独立线程里运行 Mozilla 的 Bergamot 引擎（WASM），不占用主线程。
 *
 * 胶水脚本是上游自动生成的经典脚本，只定义全局函数 loadBergamot、没有任何导出。
 * 为了保持文件与上游逐字节一致（可用哈希核对、升级时直接替换），这里以源码文本引入，
 * 再用 Function 取出该函数；项目不设置 CSP，此做法可行。
 * 引擎 WASM 与模型由主线程下载并校验后传入，Worker 自己不发任何网络请求。
 */
import type { TranslatorAssets, TranslatorRequest, TranslatorResponse } from './protocol'
import glueSource from '../vendor/bergamot-translator.js?raw'

/** 胶水脚本暴露的对象里本文件用到的部分 */
interface AlignedMemory {
  getByteArrayView: () => Uint8Array
}
interface WasmVector<T> {
  push_back: (value: T) => void
  size: () => number
  get: (index: number) => T
  delete: () => void
}
interface ResponseOptions {
  qualityScores: boolean
  alignment: boolean
  html: boolean
}
interface TranslationResponse {
  getTranslatedText: () => string
}
interface Bergamot {
  AlignedMemory: new (size: number, alignment: number) => AlignedMemory
  AlignedMemoryList: new () => WasmVector<AlignedMemory>
  TranslationModel: new (
    source: string,
    target: string,
    config: string,
    model: AlignedMemory,
    lex: AlignedMemory | null,
    vocabs: WasmVector<AlignedMemory>,
    qualityModel: null,
  ) => object
  BlockingService: new (options: { cacheSize: number }) => {
    translate: (
      model: object,
      messages: WasmVector<string>,
      options: WasmVector<ResponseOptions>,
    ) => WasmVector<TranslationResponse>
  }
  VectorString: new () => WasmVector<string>
  VectorResponseOptions: new () => WasmVector<ResponseOptions>
}
type LoadBergamot = (module: Record<string, unknown>) => Bergamot

/** 各类文件在 WASM 堆中的对齐要求，取自 Firefox 的 translations-engine.worker.js */
const ALIGNMENT = { model: 256, lex: 64, vocab: 64 } as const

/**
 * 引擎配置，与 Firefox 保持一致。`int8shiftAlphaAll` 对应 `*.intgemm.alphas.bin` 模型；
 * `cpu-threads: 0` 表示单线程同步执行，不需要 SharedArrayBuffer。
 */
const MODEL_CONFIG: Record<string, string> = {
  'beam-size': '1',
  normalize: '1.0',
  'word-penalty': '0',
  'max-length-break': '128',
  'mini-batch-words': '1024',
  workspace: '128',
  'max-length-factor': '2.0',
  'skip-cost': 'true',
  'cpu-threads': '0',
  quiet: 'true',
  'quiet-translation': 'true',
  'gemm-precision': 'int8shiftAlphaAll',
  alignment: 'soft',
}

/** Marian 的配置解析依赖这种缩进，写法照搬 Firefox */
const toConfigText = (entries: Record<string, string>) => {
  const indent = '            '
  return `\n${Object.entries(entries)
    .map(([key, value]) => `${indent}${key}: ${value}\n`)
    .join('')}${indent}`
}

let engine: { translate: (text: string) => string } | null = null

async function initialize(assets: TranslatorAssets, source: string, target: string) {
  // eslint-disable-next-line no-new-func -- 见文件头：上游脚本没有导出，只能按源码文本取出入口函数
  const loadBergamot = new Function(`${glueSource}\n;return loadBergamot`)() as LoadBergamot
  const bergamot = await new Promise<Bergamot>((resolve, reject) => {
    const module = loadBergamot({
      // 起始 40 MiB，按需增长；取值与 Firefox 一致，起点小反而总占用更低
      INITIAL_MEMORY: 41_943_040,
      print: () => {},
      printErr: () => {},
      onAbort: () => reject(new Error('翻译引擎 WASM 加载中止')),
      onRuntimeInitialized: () => {
        // 等一个微任务，确保上面的 module 变量已经赋值
        void Promise.resolve().then(() => resolve(module))
      },
      wasmBinary: assets.engine,
    })
  })

  const toAligned = (buffer: ArrayBuffer, alignment: number) => {
    const memory = new bergamot.AlignedMemory(buffer.byteLength, alignment)
    memory.getByteArrayView().set(new Uint8Array(buffer))
    return memory
  }
  const vocabs = new bergamot.AlignedMemoryList()
  vocabs.push_back(toAligned(assets.vocab, ALIGNMENT.vocab))
  const model = new bergamot.TranslationModel(
    source,
    target,
    toConfigText(MODEL_CONFIG),
    toAligned(assets.model, ALIGNMENT.model),
    toAligned(assets.lex, ALIGNMENT.lex),
    vocabs,
    null,
  )
  // 不用引擎自带的缓存：去重与缓存由主线程的译文表负责
  const service = new bergamot.BlockingService({ cacheSize: 0 })

  engine = {
    translate(text) {
      const messages = new bergamot.VectorString()
      const options = new bergamot.VectorResponseOptions()
      let responses: WasmVector<TranslationResponse> | null = null
      try {
        messages.push_back(text)
        options.push_back({ qualityScores: false, alignment: false, html: false })
        responses = service.translate(model, messages, options)
        return responses.get(0).getTranslatedText()
      } finally {
        // WASM 侧对象不受 JS 垃圾回收管理，必须手动释放
        messages.delete()
        options.delete()
        responses?.delete()
      }
    },
  }
}

const post = (message: TranslatorResponse) => (globalThis as unknown as Worker).postMessage(message)

globalThis.onmessage = async (event: MessageEvent<TranslatorRequest>) => {
  const request = event.data
  try {
    if (request.type === 'init') {
      const start = performance.now()
      await initialize(request.assets, request.source, request.target)
      // 预热：首次翻译要分配工作区，耗时明显高于后续，放在初始化里一并完成
      engine!.translate('你好')
      post({ id: request.id, ok: true, type: 'init', initMs: performance.now() - start })
      return
    }
    if (!engine) throw new Error('翻译引擎尚未初始化')
    // 逐条调用：实测比整批送入快约 40%，空文本会让引擎出错，直接原样返回
    const texts = request.texts.map((text) => (text.trim() ? engine!.translate(text) : ''))
    post({ id: request.id, ok: true, type: 'translate', texts })
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
