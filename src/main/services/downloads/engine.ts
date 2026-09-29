import type { DownloadPeer } from '@marchen/shared/downloads'
import type {
  DownloadEngine,
  EngineCommand,
  EngineResponse,
  EngineStats,
  PreparedTorrent,
} from './engine-port'
import { randomUUID } from 'node:crypto'
import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import { utilityProcess } from 'electron'
import workerPath from './worker?modulePath'

export class ProcessDownloadEngine implements DownloadEngine {
  private child?: Electron.UtilityProcess
  private generation = ''
  private pending = new Map<
    string,
    {
      resolve: (value: PreparedTorrent | DownloadPeer[] | undefined) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    private onStats: (stats: EngineStats) => void,
    private onCrash: () => void,
  ) {}
  private request(command: EngineCommand): Promise<PreparedTorrent | DownloadPeer[] | undefined> {
    if (!this.child) {
      this.generation = randomUUID()
      const child = utilityProcess.fork(workerPath, [], {
        stdio: 'ignore',
        serviceName: 'Marchen 下载',
      })
      this.child = child
      child.on('message', (response: EngineResponse) => {
        if (child !== this.child || response.generation !== this.generation) return
        if ('stats' in response) return this.onStats(response.stats)
        const pending = this.pending.get(response.requestId)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(response.requestId)
        response.ok
          ? pending.resolve(response.value)
          : pending.reject(new Error(response.message ?? '下载操作失败'))
      })
      child.on('exit', () => {
        if (this.child !== child) return
        this.child = undefined
        for (const value of this.pending.values()) {
          clearTimeout(value.timer)
          value.reject(new Error('下载进程已退出，请重试'))
        }
        this.pending.clear()
        this.onCrash()
      })
    }
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          // 控制命令超时必须结束进程；只读节点查询失败不应中断下载。
          if (command.kind !== 'peers') this.child?.kill()
          reject(new Error('下载进程响应超时'))
          this.pending.delete(requestId)
        },
        command.kind === 'prepare'
          ? DOWNLOAD_LIMITS.metadataMs + 5000
          : command.kind === 'start'
            ? 610000
            : DOWNLOAD_LIMITS.stopMs,
      )
      this.pending.set(requestId, { resolve, reject, timer })
      this.child!.postMessage({ requestId, generation: this.generation, command })
    })
  }
  async prepare(id: string, input: string | Uint8Array) {
    const result = await this.request({ kind: 'prepare', id, input })
    if (!result || Array.isArray(result)) throw new Error('种子信息为空')
    return result
  }
  async start(id: string, metadata: Uint8Array, directory: string, selected: number[]) {
    await this.request({ kind: 'start', id, metadata, directory, selected })
  }
  async peers(id: string): Promise<DownloadPeer[]> {
    if (!this.child) return []
    const result = await this.request({ kind: 'peers', id })
    if (!Array.isArray(result)) throw new Error('节点信息无效')
    return result
  }
  async stop(id: string) {
    if (this.child) await this.request({ kind: 'stop', id })
  }
  async limit(bytes: number) {
    await this.request({ kind: 'limit', bytes })
  }
  async shutdown() {
    if (this.child) await this.request({ kind: 'shutdown' })
  }
}
