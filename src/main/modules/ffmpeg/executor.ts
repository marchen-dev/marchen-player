import type { Readable } from 'node:stream'
import { spawn } from 'node:child_process'

export type FfmpegExecutionFailure =
  'cancelled' | 'exit' | 'input-denied' | 'output-limit' | 'spawn' | 'timeout'

export type FfmpegExecutionKind = 'media' | 'probe'

export interface FfmpegProgressRecord {
  [key: string]: string
}

export interface FfmpegExecutionResult {
  code: number
  signal: NodeJS.Signals | null
  stdout: Buffer
  stderr: string
  durationMs: number
}

export interface FfmpegExecutionOptions {
  executable: string
  arguments: readonly string[]
  kind?: FfmpegExecutionKind
  inputs?: readonly string[]
  allowedInputProtocols?: readonly string[]
  signal?: AbortSignal
  timeoutMs?: number
  gracefulShutdownMs?: number
  stdoutLimitBytes?: number
  stderrLimitBytes?: number
  progress?: boolean
  onProgress?: (record: Readonly<FfmpegProgressRecord>) => void
}

export const DEFAULT_FFPROBE_TIMEOUT_MS = 15_000
export const DEFAULT_STDOUT_LIMIT_BYTES = 8 * 1024 * 1024

export interface FfmpegExecution {
  pid?: number
  result: Promise<FfmpegExecutionResult>
  cancel: () => void
}

export class FfmpegExecutionError extends Error {
  readonly failure: FfmpegExecutionFailure
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly durationMs: number
  readonly executable?: string
  readonly arguments?: readonly string[]
  readonly inputs?: readonly string[]

  constructor(
    message: string,
    details: {
      failure: FfmpegExecutionFailure
      code?: number | null
      signal?: NodeJS.Signals | null
      stderr?: string
      durationMs: number
      cause?: unknown
      executable?: string
      arguments?: readonly string[]
      inputs?: readonly string[]
    },
  ) {
    super(message, { cause: details.cause })
    this.name = 'FfmpegExecutionError'
    this.failure = details.failure
    this.code = details.code ?? null
    this.signal = details.signal ?? null
    this.stderr = details.stderr ?? ''
    this.durationMs = details.durationMs
    this.executable = details.executable
    this.arguments = details.arguments
    this.inputs = details.inputs
  }
}

class TailBuffer {
  readonly #limit: number
  #value: Buffer = Buffer.alloc(0)

  constructor(limit: number) {
    this.#limit = Math.max(0, limit)
  }

  append(chunk: Buffer): void {
    if (this.#limit === 0) return
    if (chunk.byteLength >= this.#limit) {
      this.#value = chunk.subarray(chunk.byteLength - this.#limit)
      return
    }
    const overflow = this.#value.byteLength + chunk.byteLength - this.#limit
    this.#value = Buffer.concat([
      overflow > 0 ? this.#value.subarray(overflow) : this.#value,
      chunk,
    ])
  }

  toString(): string {
    return this.#value.toString('utf8')
  }
}

const createProgressConsumer = (
  stream: Readable,
  onProgress?: FfmpegExecutionOptions['onProgress'],
): void => {
  let pending = ''
  let record: FfmpegProgressRecord = {}

  const consumeLine = (line: string) => {
    if (line.length === 0) {
      if (Object.keys(record).length > 0) onProgress?.(Object.freeze({ ...record }))
      record = {}
      return
    }
    const separator = line.indexOf('=')
    if (separator <= 0) return
    const key = line.slice(0, separator)
    record[key] = line.slice(separator + 1)
    // FFmpeg 的 -progress 协议不保证批次之间存在空行；每个 progress=continue/end
    // 本身就是一批记录的终止符。若只等空行，长媒体会直到整个任务结束才发布首批 HLS。
    if (key === 'progress') {
      onProgress?.(Object.freeze({ ...record }))
      record = {}
    }
  }

  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
  })
  stream.on('end', () => {
    if (pending.length > 0) consumeLine(pending)
    if (Object.keys(record).length > 0) onProgress?.(Object.freeze({ ...record }))
  })
}

const inputProtocol = (input: string): string | undefined => {
  // Windows 盘符和 UNC 都是本地路径，不按 URL scheme 解释。
  if (/^[a-z]:[\\/]/i.test(input) || input.startsWith('\\\\')) return undefined
  return input.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
}

export const validateFfmpegInputs = (
  inputs: readonly string[],
  allowedProtocols: readonly string[] = ['file'],
): void => {
  const allowed = new Set(allowedProtocols.map((protocol) => protocol.toLowerCase()))
  for (const input of inputs) {
    const protocol = inputProtocol(input)
    if (protocol && !allowed.has(protocol)) {
      throw new FfmpegExecutionError(`不允许 FFmpeg 读取 ${protocol}: 输入`, {
        failure: 'input-denied',
        durationMs: 0,
      })
    }
  }
}

export class FfmpegProcessExecutor {
  start(options: FfmpegExecutionOptions): FfmpegExecution {
    const startedAt = Date.now()
    const gracefulShutdownMs = options.gracefulShutdownMs ?? 1_500
    const stderr = new TailBuffer(options.stderrLimitBytes ?? 128 * 1024)
    const stdout: Buffer[] = []
    let cancellationRequested = options.signal?.aborted ?? false
    let timeoutRequested = false
    let outputLimitExceeded = false
    let settled = false
    let forceKillTimer: NodeJS.Timeout | undefined
    let timeoutTimer: NodeJS.Timeout | undefined
    const diagnostics = {
      executable: options.executable,
      arguments: [...options.arguments],
      inputs: [...(options.inputs ?? [])],
    }

    try {
      validateFfmpegInputs(options.inputs ?? [], options.allowedInputProtocols)
    } catch (error) {
      return {
        result: Promise.reject(error),
        cancel: () => undefined,
      }
    }

    if (cancellationRequested) {
      return {
        result: Promise.reject(
          new FfmpegExecutionError('FFmpeg 任务已取消', {
            failure: 'cancelled',
            durationMs: 0,
          }),
        ),
        cancel: () => undefined,
      }
    }

    // shell 必须保持 false，媒体路径只作为独立参数传递。stdin 由 stdio 直接关闭；
    // 需要进度的 FFmpeg preset 显式传入 `-progress pipe:3`，执行器只负责消费 fd 3。
    const child = spawn(options.executable, [...options.arguments], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe', options.progress ? 'pipe' : 'ignore'],
      windowsHide: true,
    })

    const clearLifecycle = () => {
      if (forceKillTimer) clearTimeout(forceKillTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      options.signal?.removeEventListener('abort', requestCancellation)
    }

    const requestTermination = () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      forceKillTimer ??= setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, gracefulShutdownMs)
      forceKillTimer.unref()
    }

    const requestCancellation = () => {
      cancellationRequested = true
      requestTermination()
    }

    options.signal?.addEventListener('abort', requestCancellation, { once: true })
    const timeoutMs =
      options.timeoutMs ?? (options.kind === 'probe' ? DEFAULT_FFPROBE_TIMEOUT_MS : undefined)
    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timeoutRequested = true
        requestTermination()
      }, timeoutMs)
      timeoutTimer.unref()
    }

    const stdoutLimitBytes = options.stdoutLimitBytes ?? DEFAULT_STDOUT_LIMIT_BYTES
    let stdoutBytes = 0
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > stdoutLimitBytes) {
        outputLimitExceeded = true
        requestTermination()
        return
      }
      stdout.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk))
    if (options.progress) {
      const progressStream = child.stdio[3]
      if (progressStream && 'on' in progressStream) {
        createProgressConsumer(progressStream as Readable, options.onProgress)
      }
    }

    const result = new Promise<FfmpegExecutionResult>((resolve, reject) => {
      child.once('error', (cause) => {
        if (settled) return
        settled = true
        clearLifecycle()
        reject(
          new FfmpegExecutionError('无法启动 FFmpeg 子进程', {
            failure: 'spawn',
            stderr: stderr.toString(),
            durationMs: Date.now() - startedAt,
            cause,
            ...diagnostics,
          }),
        )
      })
      child.once('close', (code, signal) => {
        if (settled) return
        settled = true
        clearLifecycle()
        const durationMs = Date.now() - startedAt
        const executionResult: FfmpegExecutionResult = {
          code: code ?? -1,
          signal,
          stdout: Buffer.concat(stdout),
          stderr: stderr.toString(),
          durationMs,
        }
        if (outputLimitExceeded) {
          reject(
            new FfmpegExecutionError(`FFmpeg 标准输出超过 ${stdoutLimitBytes} 字节限制`, {
              failure: 'output-limit',
              code,
              signal,
              stderr: executionResult.stderr,
              durationMs,
              ...diagnostics,
            }),
          )
        } else if (timeoutRequested) {
          reject(
            new FfmpegExecutionError('FFmpeg 任务执行超时', {
              failure: 'timeout',
              code,
              signal,
              stderr: executionResult.stderr,
              durationMs,
              ...diagnostics,
            }),
          )
        } else if (cancellationRequested) {
          reject(
            new FfmpegExecutionError('FFmpeg 任务已取消', {
              failure: 'cancelled',
              code,
              signal,
              stderr: executionResult.stderr,
              durationMs,
              ...diagnostics,
            }),
          )
        } else if (code !== 0) {
          reject(
            new FfmpegExecutionError(`FFmpeg 子进程异常退出（${code ?? signal ?? 'unknown'}）`, {
              failure: 'exit',
              code,
              signal,
              stderr: executionResult.stderr,
              durationMs,
              ...diagnostics,
            }),
          )
        } else {
          resolve(executionResult)
        }
      })
    })

    return {
      pid: child.pid,
      result,
      cancel: requestCancellation,
    }
  }

  run(options: FfmpegExecutionOptions): Promise<FfmpegExecutionResult> {
    return this.start(options).result
  }
}
