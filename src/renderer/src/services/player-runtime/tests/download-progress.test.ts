import type { DownloadFile } from '@marchen/shared/downloads'
import { fileProgressLabel, taskProgress } from '@renderer/page/downloads/progress'
import { expect, it } from 'vitest'

const file = (patch: Partial<DownloadFile>): DownloadFile => ({
  index: 0,
  path: 'a.mkv',
  size: 1000,
  selected: true,
  verifiedBytes: 0,
  complete: false,
  ...patch,
})
const task = (files: DownloadFile[], downloadSpeed = 0) => ({
  files,
  selectedBytes: files.filter((f) => f.selected).reduce((n, f) => n + f.size, 0),
  downloadSpeed,
})

it('进度按已下载计算，不再停在已确认的 0%', () => {
  const progress = taskProgress(task([file({ downloadedBytes: 250 })], 100))
  expect(progress).toMatchObject({ done: 250, percentage: 25, completed: false, finishing: false })
  expect(progress.eta).toBe(1)
})

it('数据到齐但未确认完成时最多 99%，并标记为正在完成', () => {
  const progress = taskProgress(task([file({ downloadedBytes: 1000, verifiedBytes: 980 })], 100))
  expect(progress).toMatchObject({ done: 1000, percentage: 99, finishing: true, eta: null })
  const done = taskProgress(task([file({ downloadedBytes: 1000, verifiedBytes: 1000, complete: true })]))
  expect(done).toMatchObject({ percentage: 100, completed: true, finishing: false })
})

it('缺少运行时进度时回退到确认字节，未选文件不计入', () => {
  const progress = taskProgress(
    task([file({ verifiedBytes: 400 }), file({ index: 1, selected: false, downloadedBytes: 900 })]),
  )
  expect(progress).toMatchObject({ done: 400, total: 1000, percentage: 40 })
})

it('已下载不会小于确认字节，也不会超过文件大小', () => {
  expect(taskProgress(task([file({ verifiedBytes: 500, downloadedBytes: 300 })])).done).toBe(500)
  expect(taskProgress(task([file({ downloadedBytes: 5000 })])).done).toBe(1000)
})

it('大小未知的 HTTP 任务不显示百分比和 ETA', () => {
  const progress = taskProgress(task([file({ size: 0, verifiedBytes: 300 })], 100))
  expect(progress).toMatchObject({ done: 300, total: 0, percentage: 0, finishing: false, eta: null })
})

it('单文件文案不出现校验，数据到齐时显示正在完成', () => {
  const format = (n: number) => `${n}B`
  expect(fileProgressLabel(file({ downloadedBytes: 300 }), format)).toBe('300B / 1000B')
  expect(fileProgressLabel(file({ downloadedBytes: 1000 }), format)).toBe('正在完成…')
})
