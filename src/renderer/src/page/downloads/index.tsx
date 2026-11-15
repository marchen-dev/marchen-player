import type {
  DownloadDraft,
  DownloadInput,
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
import { segmentedActiveClassName } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { ipcClient } from '@renderer/lib/client'
import { describeError } from '@renderer/lib/errors'
import { getPlayerLoadingService } from '@renderer/services/player-loading'
import { trackDownloadAction, trackDownloadAdd } from '@renderer/services/telemetry/downloads'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { PeerDialog } from './peers'
import { fileProgressLabel, HASH_FAILURE_NOTICE_THRESHOLD, taskProgress } from './progress'
import { bytes, downloadCall, downloadError, downloadsAtom, torrentRequestAtom } from './state'

export default function Downloads() {
  const { t } = useTranslation(['downloads', 'common', 'app'])
  const pageTitle = t('app:routes.downloads')
  usePageHeader(useMemo(() => ({ title: pageTitle, actions: null }), [pageTitle]))
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
      className="bg-background h-full overflow-y-auto px-8 py-9"
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
            <h1 className="text-3xl font-semibold">{pageTitle}</h1>
            <p className="text-muted-foreground mt-2 text-sm">{t('subtitle')}</p>
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
            {t('new')}
          </Button>
        </header>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="bg-muted flex rounded-xl p-1">
            {(['all', 'active', 'done'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                className={filter === value ? segmentedActiveClassName : undefined}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`filter.${value}`)}
              </Button>
            ))}
          </div>
          <Input
            className="max-w-64"
            aria-label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {snapshot?.error && (
          <p role="alert" className="text-destructive mb-4">
            {describeError(snapshot.error, t('operationFailed'))}
          </p>
        )}
        {!snapshot ? (
          <p className="text-muted-foreground p-12 text-center">{t('loading')}</p>
        ) : !tasks.length ? (
          <div className="rounded-2xl border border-dashed p-16 text-center">
            <i className="icon-[mingcute--download-2-line] text-muted-foreground mb-4 text-4xl" />
            <h2 className="text-lg font-medium">
              {search || filter !== 'all' ? t('empty.filteredTitle') : t('empty.title')}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {search || filter !== 'all'
                ? t('empty.filteredDescription')
                : t('empty.description')}
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
              {search || filter !== 'all' ? t('empty.clearFilters') : t('empty.action')}
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
            toast({ title: t('exists') })
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
  const { t } = useTranslation(['downloads', 'common', 'app'])
  const [showPeers, setShowPeers] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [remove, setRemove] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const selected = task.files.filter((f) => f.selected)
  const { done, total, completed, percentage, finishing, eta } = taskProgress(task)
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
          aria-label={t(expanded ? 'task.collapse' : 'task.expand', { name: task.name })}
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
            title={t(expanded ? 'task.collapseTitle' : 'task.expandTitle', { name: task.name })}
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
              ? t('task.httpStatus', {
                  state:
                    task.state === 'waiting' ? t('task.httpQueued') : t(`state.${task.state}`),
                })
              : t('task.torrentStatus', {
                  state: t(`state.${task.state}`),
                  count: selected.length,
                })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selected.length === 1 && selected[0].complete && isVideoFile(selected[0].path) && (
            <Button size="sm" disabled={busy} onClick={() => play(selected[0].index)}>
              {t('task.play')}
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
              {active
                ? t('task.pause')
                : task.state === 'error'
                  ? t('common:action.retry')
                  : t('task.resume')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id={`download-menu-${task.id}`}
                size="sm"
                variant="ghost"
                aria-label={t('task.more', { name: task.name })}
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
                {t('task.openFolder')}
              </DropdownMenuItem>
              {!task.http && (
                <DropdownMenuItem
                  onSelect={() => {
                    captureFeatureUsed('download_peer_details', 'open')
                    setShowPeers(true)
                  }}
                >
                  {t('task.peers')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive hover:text-destructive"
                onSelect={() => setRemove(true)}
              >
                {t('task.remove')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className="bg-muted mt-4 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={t('task.progressLabel')}
        aria-valuenow={total ? percentage : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-primary h-full transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>
          {bytes(done)} / {total ? bytes(total) : t('task.sizeUnknown')}
          {total ? ` · ${percentage}%` : ''}
        </span>
        <span>
          {!task.http && (task.state === 'downloading' || task.state === 'waiting') && (
            <span title={t('task.peersHint')}>
              {t('task.peersConnected', { count: task.peers })}{' '}
            </span>
          )}
          {finishing && (task.state === 'downloading' || task.state === 'waiting')
            ? t('task.finishing')
            : task.state === 'downloading'
              ? `${bytes(task.downloadSpeed)}/s · ${
                  eta === null ? t('task.estimating') : t('task.eta', { count: eta })
                }`
              : ''}
        </span>
      </div>
      {/* 偶发的分片失败会自动重新下载，只有反复失败才提示，且不向用户暴露分片和校验的概念 */}
      {!task.http && !completed && (task.hashFailures ?? 0) > HASH_FAILURE_NOTICE_THRESHOLD && (
        <p className="text-muted-foreground mt-2 text-xs">{t('task.hashRetry')}</p>
      )}
      {task.error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {describeError(task.error, t('state.error'))}
        </p>
      )}
      {expanded && !task.http && (
        <div id={`download-file-list-${task.id}`} className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {t('task.filesHint')}
              {busy ? t('task.applying') : ''}
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
                {t('task.selectAll')}
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
                {t('task.deselectAll')}
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
                  ? t('task.fileDone')
                  : !f.selected
                    ? t('task.fileUnselected')
                    : fileProgressLabel(f, bytes)}
              </span>
              {f.selected && f.complete && isVideoFile(f.path) && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => play(f.index)}>
                  {t('task.play')}
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
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target =
              document.getElementById(`download-menu-${task.id}`) ??
              document.getElementById('new-download')
            target?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('removeDialog.title')}</DialogTitle>
            <DialogDescription>{t('removeDialog.description')}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
            />
            {t('removeDialog.deleteFiles')}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(false)}>
              {t('common:action.cancel')}
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
              {t('removeDialog.confirm')}
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
  const { t } = useTranslation(['downloads', 'common', 'app'])
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
        if (!cancelledRef.current) setError(describeError(e, t('newDialog.fetchFailed')))
      } finally {
        setBusy(false)
      }
    },
    [id, t],
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
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById('new-download')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{draft ? t('newDialog.selectTitle') : t('newDialog.title')}</DialogTitle>
          <DialogDescription>
            {draft ? draft.name : t('newDialog.description')}
          </DialogDescription>
        </DialogHeader>
        {!draft ? (
          <>
            <Input
              autoFocus
              aria-label={t('newDialog.urlLabel')}
              placeholder={t('newDialog.urlPlaceholder')}
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
              {t('newDialog.chooseTorrent')}
            </Button>
            {busy && (
              <p role="status" className="text-muted-foreground text-sm">
                {t('newDialog.fetching')}
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
                {t('task.selectAll')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                {t('task.deselectAll')}
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
              {t('newDialog.selected', { count: selected.length })}{' '}
              {bytes(
                draft.files
                  .filter((f) => selected.includes(f.index))
                  .reduce((n, f) => n + f.size, 0),
              )}
            </p>
            <label className="text-sm">{t('newDialog.saveTo')}</label>
            <div className="flex gap-2">
              <Input aria-label={t('newDialog.saveTo')} value={directory} readOnly />
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
                {t('newDialog.choose')}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('newDialog.torrentHint')}
            </p>
          </>
        )}
        {!draft && isHttp && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              {t('newDialog.httpHint')}
            </p>
            <label className="text-sm">{t('newDialog.httpDirectory')}</label>
            <div className="flex gap-2">
              <Input aria-label={t('newDialog.httpDirectoryLabel')} readOnly value={directory} />
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
                {t('newDialog.choose')}
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
            {t('common:action.cancel')}
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
                    setError(describeError(e, t('operationFailed')))
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
                  setError(describeError(e, t('operationFailed')))
                  setBusy(false)
                })
            }}
          >
            {draft || isHttp ? t('newDialog.start') : t('newDialog.fetchInfo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
