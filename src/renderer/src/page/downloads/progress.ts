import type { DownloadFile, DownloadTask } from '@marchen/shared/downloads'

/** 分片失败超过这个次数才提示用户；偶发失败会自动重新下载，不打扰 */
export const HASH_FAILURE_NOTICE_THRESHOLD = 5

/** 面向用户的已下载字节；缺少运行时进度时回退到确认字节，且不超过文件大小 */
export const fileDownloadedBytes = (file: Pick<DownloadFile, 'verifiedBytes' | 'downloadedBytes' | 'size'>) => {
  const downloaded = Math.max(file.verifiedBytes, file.downloadedBytes ?? file.verifiedBytes)
  return file.size > 0 ? Math.min(file.size, downloaded) : downloaded
}

/** 未确认完成前最多显示 99%，避免出现「100% 却不能播放」 */
const percentOf = (done: number, total: number, complete: boolean) => {
  if (!total) return 0
  const value = Math.min(100, Math.floor((done / total) * 100))
  return complete ? value : Math.min(99, value)
}

export interface TaskProgress {
  done: number
  total: number
  percentage: number
  completed: boolean
  /** 数据已全部到达，正在确认最后的分片 */
  finishing: boolean
  /** 剩余分钟数；无法估算时为 null */
  eta: number | null
}

/**
 * 下载页唯一的进度口径：界面只展示「下了多少」，不暴露分片校验的概念。
 * 完成与可播放仍由 complete（确认通过）决定。
 */
export function taskProgress(
  task: Pick<DownloadTask, 'files' | 'selectedBytes' | 'downloadSpeed'>,
): TaskProgress {
  const selected = task.files.filter((file) => file.selected)
  const total = task.selectedBytes
  const completed = selected.length > 0 && selected.every((file) => file.complete)
  const downloaded = selected.reduce((sum, file) => sum + fileDownloadedBytes(file), 0)
  const done = total ? Math.min(total, downloaded) : downloaded
  return {
    done,
    total,
    percentage: percentOf(done, total, completed),
    completed,
    finishing: !completed && total > 0 && done >= total,
    eta:
      total > 0 && task.downloadSpeed > 0 && done < total
        ? Math.max(1, Math.ceil((total - done) / task.downloadSpeed / 60))
        : null,
  }
}

/** 展开列表里的单文件进度文案 */
export function fileProgressLabel(
  file: Pick<DownloadFile, 'verifiedBytes' | 'downloadedBytes' | 'size' | 'complete'>,
  format: (bytes: number) => string,
) {
  const done = fileDownloadedBytes(file)
  if (file.size > 0 && done >= file.size) return '正在完成…'
  return `${format(done)} / ${format(file.size)}`
}
