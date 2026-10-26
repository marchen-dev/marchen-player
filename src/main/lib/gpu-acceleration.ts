import type { GpuAcceleration } from '@marchen/shared/constants/telemetry'
import { app } from 'electron'

/** Chromium 特性状态以 enabled 开头表示可用，其余（disabled_* / unavailable_*）都视为不可用 */
const isEnabled = (status: string | undefined) => !!status?.startsWith('enabled')

/**
 * 把 getGPUFeatureStatus 的十几项归纳成一个低基数维度。
 * 合成退回软件意味着驱动被拉黑或 GPU 进程崩溃，视频与字幕渲染都会落到 CPU 上。
 */
export const resolveGpuAcceleration = (
  status: Partial<Electron.GPUFeatureStatus> = app.getGPUFeatureStatus(),
): GpuAcceleration => {
  if (!isEnabled(status.gpu_compositing)) return 'software'
  return isEnabled(status.video_decode) ? 'hardware' : 'partial'
}
