import type {
  DownloadDraft,
  DownloadInput,
  DownloadState,
  DownloadTask,
} from '@marchen/shared/downloads'
import type { TelemetryEventMap } from '@renderer/services/telemetry/contracts'
import { isVideoFile } from '@marchen/shared/media'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdownMenu'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '@renderer/services/player-loading'
import { trackDownloadAction, trackDownloadAdd } from '@renderer/services/telemetry/downloads'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PeerDialog } from './peers'
import { bytes, downloadCall, downloadError, downloadsAtom, torrentRequestAtom } from './state'

const labels: Record<DownloadState, string> = {
  checking: '正在校验',
  waiting: '等待连接',
  downloading: '下载中',
  pausing: '正在暂停',
  paused: '已暂停',
  completed: '已完成',
  error: '下载失败',
}
const DOWNLOAD_HEADER = { title: '下载', actions: null }
export default function Downloads() {
  usePageHeader(DOWNLOAD_HEADER)
  const snapshot = useAtomValue(downloadsAtom)
  const [request, setRequest] = useAtom(torrentRequestAtom)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<DownloadInput | undefined>()
  const activeRequest = open ? null : request
  const modalSource = useMemo<DownloadInput | undefined>(
    () => (activeRequest ? { kind: 'torrent', path: activeRequest.path } : source),
    [activeRequest, source],
  )
  const tasks =
    snapshot?.tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'done') ===
            (t.files.some((f) => f.selected) &&
              t.files.filter((f) => f.selected).every((f) => f.complete))),
    ) ?? []
  const close = () => {
    setOpen(false)
    setSource(undefined)
    if (activeRequest) {
      void ipcClient?.app.torrentHandled({ id: activeRequest.id })
      setRequest(null)
    }
  }
  return (
    <div
      data-telemetry-replay-block
      className="ph-no-capture bg-background h-full overflow-y-auto px-8 py-9"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file?.name.toLowerCase().endsWith('.torrent')) {
          setSource({ kind: 'torrent', path: window.api.showFilePath(file) })
          setOpen(true)
        }
      }}
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">下载</h1>
            <p className="text-muted-foreground mt-2 text-sm">下载完成后，随时开始观看</p>
          </div>
          <Button
            id="new-download"
            className="rounded-full"
            onClick={() => {
              setSource(undefined)
              setOpen(true)
            }}
          >
            <i className="icon-[mingcute--add-line] mr-2" />
            新建下载
          </Button>
        </header>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="bg-muted flex rounded-xl p-1">
            {[
              ['all', '全部'],
              ['active', '进行中'],
              ['done', '已完成'],
            ].map(([value, title]) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                className={
                  filter === value
                    ? 'bg-background text-foreground hover:bg-background hover:text-foreground shadow-sm'
                    : undefined
                }
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {title}
              </Button>
            ))}
          </div>
          <Input
            className="max-w-64"
            aria-label="搜索下载任务"
            placeholder="搜索任务名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {snapshot?.error && (
          <p role="alert" className="text-destructive mb-4">
            {snapshot.error}
          </p>
        )}
        {!snapshot ? (
          <p className="text-muted-foreground p-12 text-center">正在读取下载任务…</p>
        ) : !tasks.length ? (
          <div className="rounded-2xl border border-dashed p-16 text-center">
            <i className="icon-[mingcute--download-2-line] text-muted-foreground mb-4 text-4xl" />
            <h2 className="text-lg font-medium">
              {search || filter !== 'all' ? '没有符合条件的任务' : '还没有下载任务'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {search || filter !== 'all'
                ? '试试清空搜索或切换筛选'
                : '粘贴 HTTP/HTTPS 或磁力链接，或拖入种子文件'}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                if (search || filter !== 'all') {
                  setSearch('')
                  setFilter('all')
                } else setOpen(true)
              }}
            >
              {search || filter !== 'all' ? '清空筛选' : '添加第一个下载'}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
      {(open || request) && (
        <NewDownload
          key={activeRequest?.id ?? 'manual'}
          source={modalSource}
          directory={snapshot?.settings.directory ?? ''}
          onClose={close}
          onExisting={(id) => {
            setSearch('')
            setFilter('all')
            close()
            toast({ title: '该下载任务已存在' })
            requestAnimationFrame(() =>
              document.getElementById(`download-${id}`)?.scrollIntoView({ block: 'nearest' }),
            )
          }}
        />
      )}
    </div>
  )
}
function TaskRow({ task }: { task: DownloadTask }) {
  const [showPeers, setShowPeers] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [remove, setRemove] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const selected = task.files.filter((f) => f.selected)
  const done = selected.reduce((n, f) => n + f.verifiedBytes, 0)
  const total = task.selectedBytes
  const completed = selected.length > 0 && selected.every((f) => f.complete)
  const percentage = total ? Math.min(100, Math.floor((done / total) * 100)) : 0
  const eta =
    total > 0 && task.downloadSpeed > 0 ? Math.ceil((total - done) / task.downloadSpeed / 60) : null
  const run = (
    work: () => Promise<unknown>,
    action: TelemetryEventMap['download_action_result']['action'] = 'selection',
    deleteFiles?: boolean,
  ) => {
    setBusy(true)
    void trackDownloadAction(task, action, work, deleteFiles)
      .catch(downloadError)
      .finally(() => setBusy(false))
  }
  const play = (index: number) =>
    run(async () => {
      const path = await downloadCall(ipcClient?.downloads.play({ id: task.id, index }))
      navigate('/player')
      markNextPlayerImportSource('download')
      getPlayerLoadingService().loadFromPath(path)
    }, 'play')
  const active = ['waiting', 'downloading', 'checking', 'pausing'].includes(task.state)
  return (
    <section id={`download-${task.id}`} className="border-b p-5 last:border-0">
      <div className="flex items-start gap-4">
        <button
          className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl"
          aria-label={`${expanded ? '收起' : '展开'} ${task.name}`}
          aria-expanded={expanded}
          onClick={() => {
            captureFeatureUsed('download_files', expanded ? 'collapse' : 'expand')
            setExpanded(!expanded)
          }}
        >
          <i className="icon-[mingcute--file-download-line] text-xl" />
        </button>
        <div className="min-w-0 flex-1">
          <button
            className="hover:text-brand-text focus-visible:text-brand-text block max-w-full truncate text-left font-medium transition-colors"
            title={`${task.name}（点击${expanded ? '收起' : '展开'}文件）`}
            aria-controls={`download-file-list-${task.id}`}
            aria-expanded={expanded}
            onClick={() => {
              captureFeatureUsed('download_files', expanded ? 'collapse' : 'expand')
              setExpanded(!expanded)
            }}
          >
            {task.name}
          </button>
          <p className="text-muted-foreground mt-1 text-xs">
            {task.http
              ? `HTTP · ${task.state === 'waiting' ? '排队 / 连接中' : labels[task.state]}`
              : `${labels[task.state]} · 已选 ${selected.length} 个文件`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selected.length === 1 && selected[0].complete && isVideoFile(selected[0].path) && (
            <Button size="sm" disabled={busy} onClick={() => play(selected[0].index)}>
              播放
            </Button>
          )}
          {!completed && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || task.state === 'pausing' || selected.length === 0}
              onClick={() =>
                run(
                  () =>
                    downloadCall(
                      active
                        ? ipcClient?.downloads.pause({ id: task.id })
                        : ipcClient?.downloads.resume({ id: task.id }),
                    ),
                  active ? 'pause' : task.state === 'error' ? 'retry' : 'resume',
                )
              }
            >
              {active ? '暂停' : task.state === 'error' ? '重试' : '继续'}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id={`download-menu-${task.id}`}
                size="sm"
                variant="ghost"
                aria-label={`更多操作：${task.name}`}
                disabled={busy}
              >
                <i className="icon-[mingcute--more-1-line] text-lg" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-44"
              onCloseAutoFocus={(event) => {
                if (remove || showPeers) event.preventDefault()
              }}
            >
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => downloadCall(ipcClient?.downloads.openFolder({ id: task.id })),
                    'open_folder',
                  )
                }
              >
                打开目录
              </DropdownMenuItem>
              {!task.http && (
                <DropdownMenuItem
                  onSelect={() => {
                    captureFeatureUsed('download_peer_details', 'open')
                    setShowPeers(true)
                  }}
                >
                  节点详情
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive hover:text-destructive"
                onSelect={() => setRemove(true)}
              >
                移除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className="bg-muted mt-4 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="下载进度"
        aria-valuenow={total ? percentage : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-primary h-full transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>
          {!task.http && '已校验 '}
          {bytes(done)} / {total ? bytes(total) : '大小未知'}
          {total ? ` · ${percentage}%` : ''}
        </span>
        <span>
          {!task.http && (task.state === 'downloading' || task.state === 'waiting') && (
            <span title="当前已连接的对等节点数，不代表每个节点都在传输">
              已连接 {task.peers} 个节点 ·{' '}
            </span>
          )}
          {task.state === 'downloading'
            ? `${bytes(task.downloadSpeed)}/s · ${eta === null ? '估算中' : `约 ${Math.max(1, eta)} 分钟`}`
            : ''}
        </span>
      </div>
      {!task.http && (task.receivedBytes ?? 0) > 0 && !completed && (
        <p
          className="text-muted-foreground mt-2 text-xs"
          title="本轮接收包含尚未校验的分片和重传，进度条只统计校验通过的数据。"
        >
          本轮已接收 {bytes(task.receivedBytes ?? 0)}
          {(task.hashFailures ?? 0) > 0 && ` · 分片校验失败 ${task.hashFailures} 次，已丢弃并重试`}
        </p>
      )}
      {task.error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {task.error}
        </p>
      )}
      {expanded && !task.http && (
        <div id={`download-file-list-${task.id}`} className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              勾选下载，取消勾选保留已有文件。{busy ? '正在应用…' : ''}
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  busy ||
                  task.state === 'pausing' ||
                  task.state === 'checking' ||
                  selected.length === task.files.length
                }
                onClick={() =>
                  run(() =>
                    downloadCall(
                      ipcClient?.downloads.selectFiles({
                        id: task.id,
                        selected: task.files.map((file) => file.index),
                      }),
                    ),
                  )
                }
              >
                全选
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  busy ||
                  task.state === 'pausing' ||
                  task.state === 'checking' ||
                  selected.length === 0
                }
                onClick={() =>
                  run(() =>
                    downloadCall(ipcClient?.downloads.selectFiles({ id: task.id, selected: [] })),
                  )
                }
              >
                取消全选
              </Button>
            </div>
          </div>
          {task.files.map((f) => (
            <div key={f.index} className="flex items-center gap-3 py-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={f.selected}
                  disabled={busy || task.state === 'pausing' || task.state === 'checking'}
                  onChange={(event) => {
                    const indices = event.target.checked
                      ? [...selected.map((file) => file.index), f.index]
                      : selected.filter((file) => file.index !== f.index).map((file) => file.index)
                    run(() =>
                      downloadCall(
                        ipcClient?.downloads.selectFiles({ id: task.id, selected: indices }),
                      ),
                    )
                  }}
                />
                <span className="min-w-0 truncate" title={f.path}>
                  {f.path.split('/').pop()}
                </span>
              </label>
              <span className="text-muted-foreground text-xs">
                {f.complete
                  ? '已完成'
                  : !f.selected
                    ? '未选择'
                    : `${bytes(f.verifiedBytes)} / ${bytes(f.size)}`}
              </span>
              {f.selected && f.complete && isVideoFile(f.path) && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => play(f.index)}>
                  播放
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {showPeers && (
        <PeerDialog id={task.id} name={task.name} onClose={() => setShowPeers(false)} />
      )}
      <Dialog open={remove} onOpenChange={setRemove}>
        <DialogContent
          data-telemetry-replay-block
          className="ph-no-capture"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target =
              document.getElementById(`download-menu-${task.id}`) ??
              document.getElementById('new-download')
            target?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>移除下载任务？</DialogTitle>
            <DialogDescription>默认保留已下载文件和播放记录。</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
            />
            同时删除已下载文件
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    await downloadCall(ipcClient?.downloads.remove({ id: task.id, deleteFiles }))
                    setRemove(false)
                  },
                  'remove',
                  deleteFiles,
                )
              }
            >
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
function NewDownload({
  source,
  directory: initialDirectory,
  onClose,
  onExisting,
}: {
  source?: DownloadInput
  directory: string
  onClose: () => void
  onExisting: (id: string) => void
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [input, setInput] = useState('')
  const isHttp = /^https?:\/\//i.test(input.trim())
  const [inputKind, setInputKind] = useState<'magnet' | 'torrent'>('magnet')
  const [draft, setDraft] = useState<DownloadDraft>()
  const [selected, setSelected] = useState<number[]>([])
  const [directory, setDirectory] = useState(initialDirectory)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelledRef = useRef(false)
  const onExistingRef = useRef(onExisting)
  const prepare = useCallback(
    async (source: DownloadInput) => {
      setBusy(true)
      setInputKind(source.kind)
      setError('')
      try {
        const result = await trackDownloadAdd(source.kind, 'metadata', () =>
          downloadCall(ipcClient?.downloads.prepare({ id, source })),
        )
        if (cancelledRef.current) return
        if (result.existingTaskId) {
          onExistingRef.current(result.existingTaskId)
          return
        }
        setDraft(result)
        setSelected(
          result.files
            .filter(
              (f) => isVideoFile(f.path) || /\.(?:ass|ssa|srt|vtt|ttf|otf|woff2?)$/i.test(f.path),
            )
            .map((f) => f.index),
        )
      } catch (e) {
        if (!cancelledRef.current) setError(e instanceof Error ? e.message : '获取信息失败')
      } finally {
        setBusy(false)
      }
    },
    [id],
  )
  useEffect(() => {
    cancelledRef.current = false
    if (source) void prepare(source)
    return () => {
      cancelledRef.current = true
      void ipcClient?.downloads.cancelDraft({ id })
    }
  }, [id, prepare, source])
  const close = () => {
    cancelledRef.current = true
    void ipcClient?.downloads.cancelDraft({ id })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        data-telemetry-replay-block
        className="ph-no-capture max-h-[85vh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById('new-download')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{draft ? '选择下载内容' : '新建下载'}</DialogTitle>
          <DialogDescription>
            {draft ? draft.name : '粘贴 HTTP/HTTPS 文件直链或磁力链接，也可选择 BT v1 种子文件。'}
          </DialogDescription>
        </DialogHeader>
        {!draft ? (
          <>
            <Input
              autoFocus
              aria-label="下载链接"
              placeholder="https://… 或 magnet:?xt=urn:btih:…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void downloadCall(ipcClient?.downloads.selectTorrent())
                  .then((path) => {
                    if (path) return prepare({ kind: 'torrent', path })
                    return undefined
                  })
                  .catch(downloadError)
              }}
            >
              选择种子文件
            </Button>
            {busy && (
              <p role="status" className="text-muted-foreground text-sm">
                正在获取文件信息，可取消后重试…
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(draft.files.map((f) => f.index))}
              >
                全选
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                取消全选
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border p-3">
              {draft.files.map((f) => (
                <label key={f.index} className="flex items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(f.index)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, f.index] : prev.filter((i) => i !== f.index),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate" title={f.path}>
                    {f.path}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{bytes(f.size)}</span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              已选 {selected.length} 项 ·{' '}
              {bytes(
                draft.files
                  .filter((f) => selected.includes(f.index))
                  .reduce((n, f) => n + f.size, 0),
              )}
            </p>
            <label className="text-sm">保存位置</label>
            <div className="flex gap-2">
              <Input aria-label="保存位置" value={directory} readOnly />
              <Button
                variant="outline"
                onClick={() => {
                  void downloadCall(ipcClient?.downloads.selectDirectory())
                    .then((path) => {
                      if (path) setDirectory(path)
                    })
                    .catch(downloadError)
                }}
              >
                选择
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              按种子原有文件或文件夹名保存，同名内容不会覆盖。
            </p>
          </>
        )}
        {!draft && isHttp && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              同时下载最多 3 个 HTTP
              文件，其余排队。重启后手动继续；续传取决于服务器支持，不支持时重新下载。
            </p>
            <label className="text-sm">保存目录</label>
            <div className="flex gap-2">
              <Input aria-label="HTTP 保存目录" readOnly value={directory} />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void downloadCall(ipcClient?.downloads.selectDirectory())
                    .then((path) => {
                      if (path) setDirectory(path)
                    })
                    .catch(downloadError)
                }}
              >
                选择
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            disabled={busy || (draft ? !selected.length || !directory : !input.trim())}
            onClick={() => {
              if (!draft && isHttp) {
                setBusy(true)
                setError('')
                void trackDownloadAdd('http', 'create', () =>
                  downloadCall(ipcClient?.downloads.addHttp({ url: input.trim(), directory })),
                )
                  .then(onClose)
                  .catch((e) => {
                    setError(e.message)
                    setBusy(false)
                  })
                return
              }
              if (!draft) {
                void prepare({ kind: 'magnet', value: input })
                return
              }
              setBusy(true)
              void trackDownloadAdd(inputKind, 'create', () =>
                downloadCall(ipcClient?.downloads.confirm({ id, selected, directory })),
              )
                .then(onClose)
                .catch((e) => {
                  setError(e.message)
                  setBusy(false)
                })
            }}
          >
            {draft || isHttp ? '开始下载' : '获取文件信息'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
