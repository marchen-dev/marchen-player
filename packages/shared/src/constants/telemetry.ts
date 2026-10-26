export const PRELOAD_ERROR_CHANNEL = 'marchen:telemetry:preload-error'

export interface PreloadErrorReport {
  kind: 'error' | 'unhandledrejection'
  name: string
  message: string
  stack?: string
}

/**
 * 启动时 GPU 加速状态，用于统计退回软件渲染的用户占比。
 * hardware：合成与视频解码都走 GPU；partial：合成走 GPU、视频解码退回软件；software：合成已退回软件
 */
export type GpuAcceleration = 'hardware' | 'partial' | 'software'
