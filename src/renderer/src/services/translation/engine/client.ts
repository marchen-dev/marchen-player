/**
 * 翻译 Worker 的主线程封装：负责创建与终止 Worker、请求与响应配对、超时，
 * 并把各种失败归并为稳定错误码。同一时刻由调用方保证只有一个翻译请求在途。
 */
import type { TranslatorAssets, TranslatorRequest, TranslatorResponse } from './protocol'

/** 稳定错误码：用于遥测 fingerprint 与界面状态 */
export type TranslatorErrorCode =
  /** 引擎或模型初始化失败 */
  | 'engine_init'
  /** 翻译调用抛错 */
  | 'engine_run'
  /** Worker 自身崩溃（脚本错误、内存不足被终止等） */
  | 'engine_crashed'
  /** 超过时限没有响应 */
  | 'engine_timeout'
  /** 已被主动终止，属于预期情况 */
  | 'engine_disposed'

export class TranslatorError extends Error {
  constructor(
    readonly code: TranslatorErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'TranslatorError'
  }
}

export const isTranslatorDisposed = (error: unknown): boolean =>
  error instanceof TranslatorError && error.code === 'engine_disposed'

/** 初始化要把约 75 MB 的文件拷进 WASM 堆并构造模型，慢机器上留足余量 */
const INIT_TIMEOUT = 60_000
/** 单批只有几条短句，正常在一秒内返回 */
const TRANSLATE_TIMEOUT = 30_000

interface Pending {
  resolve: (response: Extract<TranslatorResponse, { ok: true }>) => void
  reject: (error: TranslatorError) => void
  timer: ReturnType<typeof setTimeout>
}

type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<TranslatorResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

const createTranslatorWorker = (): WorkerLike =>
  new Worker(new URL('./translator.worker.ts', import.meta.url), { type: 'module' })

export class TranslatorClient {
  private readonly worker: WorkerLike
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private disposed = false

  constructor(createWorker: () => WorkerLike = createTranslatorWorker) {
    this.worker = createWorker()
    this.worker.onmessage = (event) => this.handleMessage(event.data)
    this.worker.onerror = (event) => {
      event.preventDefault?.()
      this.failAll(new TranslatorError('engine_crashed', event.message || '翻译 Worker 异常退出'))
    }
  }

  /** 加载引擎与模型。资源缓冲区会被转移给 Worker，调用后主线程不可再使用 */
  async init(
    assets: TranslatorAssets,
    source: string,
    target: string,
  ): Promise<{ initMs: number }> {
    const response = await this.request(
      { type: 'init', assets, source, target },
      INIT_TIMEOUT,
      'engine_init',
      [assets.engine, assets.model, assets.lex, assets.vocab],
    )
    return { initMs: response.type === 'init' ? response.initMs : 0 }
  }

  /** 返回与输入等长、顺序一致的译文 */
  async translate(texts: string[]): Promise<string[]> {
    const response = await this.request(
      { type: 'translate', texts },
      TRANSLATE_TIMEOUT,
      'engine_run',
    )
    if (response.type !== 'translate' || response.texts.length !== texts.length) {
      throw new TranslatorError('engine_run', '翻译结果数量与请求不一致')
    }
    return response.texts
  }

  /** 终止 Worker 并释放它占用的内存；在途请求以 engine_disposed 结束 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.failAll(new TranslatorError('engine_disposed', '翻译引擎已关闭'))
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
  }

  private request(
    body: DistributiveOmit<TranslatorRequest, 'id'>,
    timeout: number,
    failureCode: TranslatorErrorCode,
    transfer: Transferable[] = [],
  ): Promise<Extract<TranslatorResponse, { ok: true }>> {
    if (this.disposed) {
      return Promise.reject(new TranslatorError('engine_disposed', '翻译引擎已关闭'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new TranslatorError('engine_timeout', '翻译引擎响应超时'))
      }, timeout)
      this.pending.set(id, {
        resolve,
        // Worker 返回的失败只带文本，这里补上与请求类型对应的错误码
        reject: (error) =>
          reject(
            error.code === 'engine_run' && failureCode !== 'engine_run'
              ? new TranslatorError(failureCode, error.message)
              : error,
          ),
        timer,
      })
      try {
        this.worker.postMessage({ ...body, id } as TranslatorRequest, transfer)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new TranslatorError(failureCode, '无法向翻译引擎发送请求', { cause: error }))
      }
    })
  }

  private handleMessage(response: TranslatorResponse): void {
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    clearTimeout(pending.timer)
    if (response.ok) pending.resolve(response)
    else pending.reject(new TranslatorError('engine_run', response.message))
  }

  private failAll(error: TranslatorError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

/** 对联合类型逐个成员做 Omit，保留各成员自己的字段 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
