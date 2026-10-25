import type { BrowseNode, BrowseVideoNode, MediaSourceSummary } from '@marchen/shared/media-sources'
import type { BrowseCrumb } from './state'
import type { BrowseView } from './view'
import { providerHistoryKey } from '@marchen/shared/media'
import { Button } from '@renderer/components/ui/button'
import { db } from '@renderer/database/db'
import { cn } from '@renderer/lib/utils'
import { isCompleted } from '@renderer/services/player-runtime/history/playback-history-adapter'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'
import { errorCodeOf, useBrowse } from './api'
import { browseViewOverridesAtom, mediaSourceLocationsAtom } from './state'
import { formatDuration, formatSize, pickBrowseView } from './view'

interface WatchState {
  ratio: number
  done: boolean
}

interface SourceBrowserProps {
  source: MediaSourceSummary
  onBack: () => void
  onRelogin: (source: MediaSourceSummary) => void
  onPlay: (node: BrowseVideoNode) => void
}

const EMPTY_TRAIL: BrowseCrumb[] = []

export function SourceBrowser({ source, onBack, onRelogin, onPlay }: SourceBrowserProps) {
  const [locations, setLocations] = useAtom(mediaSourceLocationsAtom)
  const [overrides, setOverrides] = useAtom(browseViewOverridesAtom)
  const trail = locations[source.id] ?? EMPTY_TRAIL
  const ref = trail.at(-1)?.ref ?? null
  const browse = useBrowse(source, ref)
  const errorCode = errorCodeOf(browse.error)

  const setTrail = (next: BrowseCrumb[]) =>
    setLocations((current) => ({ ...current, [source.id]: next }))

  // 上次浏览的层级已被删除或移动时，逐级回退到仍然存在的上级
  useEffect(() => {
    if (errorCode === 'not_found' && trail.length > 0)
      setLocations((current) => ({ ...current, [source.id]: trail.slice(0, -1) }))
  }, [errorCode, setLocations, source.id, trail])

  const nodes = useMemo(() => browse.data?.nodes ?? [], [browse.data])
  const viewKey = `${source.id}:${ref ?? ''}`
  const view: BrowseView = overrides[viewKey] ?? pickBrowseView(nodes)
  const watch = useWatchStates(source.id, nodes)

  const enter = (node: BrowseNode) => {
    if (node.type === 'video') return onPlay(node)
    captureFeatureUsed('media_source', 'enter', node.type)
    setTrail([...trail, { ref: node.ref, title: node.title }])
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4">
        <nav aria-label="浏览位置" className="flex min-w-0 items-center gap-1 text-sm">
          <Button
            size="sm"
            variant="ghost"
            aria-label="返回媒体源列表"
            onClick={trail.length > 0 ? () => setTrail(trail.slice(0, -1)) : onBack}
          >
            <i className="icon-[mingcute--left-line] text-lg" aria-hidden="true" />
          </Button>
          <Crumb label="媒体源" onClick={onBack} />
          <Separator />
          <Crumb label={source.name} current={trail.length === 0} onClick={() => setTrail([])} />
          {trail.map((crumb, index) => (
            <span key={crumb.ref} className="flex min-w-0 items-center gap-1">
              <Separator />
              <Crumb
                label={crumb.title}
                current={index === trail.length - 1}
                onClick={() => setTrail(trail.slice(0, index + 1))}
              />
            </span>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <div className="bg-muted flex rounded-xl p-1">
            {(['grid', 'list'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                aria-label={value === 'grid' ? '海报网格' : '列表'}
                aria-pressed={view === value}
                className={
                  view === value
                    ? 'bg-background text-foreground hover:bg-background hover:text-foreground shadow-sm'
                    : undefined
                }
                onClick={() => {
                  captureFeatureUsed('media_source', 'switch_view', value)
                  setOverrides((current) => ({ ...current, [viewKey]: value }))
                }}
              >
                <i
                  className={
                    value === 'grid'
                      ? 'icon-[mingcute--grid-line] text-base'
                      : 'icon-[mingcute--list-check-line] text-base'
                  }
                  aria-hidden="true"
                />
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="刷新"
            disabled={browse.isFetching}
            onClick={() => {
              captureFeatureUsed('media_source', 'refresh')
              void browse.refetch()
            }}
          >
            <i
              className={cn(
                'icon-[mingcute--refresh-2-line] text-base',
                browse.isFetching && 'animate-spin',
              )}
              aria-hidden="true"
            />
          </Button>
        </div>
      </header>

      {source.needsLogin || errorCode === 'auth_failed' ? (
        <StatusPanel
          icon="icon-[mingcute--key-2-line]"
          title="登录已失效"
          description="服务器拒绝了当前登录，请重新输入密码。"
          action={
            <Button className="mt-5 rounded-full" onClick={() => onRelogin(source)}>
              重新登录
            </Button>
          }
        />
      ) : browse.isError ? (
        <StatusPanel
          icon="icon-[mingcute--wifi-off-line]"
          title="加载失败"
          description={browse.error instanceof Error ? browse.error.message : '无法读取目录'}
          action={
            <Button
              className="mt-5 rounded-full"
              disabled={browse.isFetching}
              onClick={() => void browse.refetch()}
            >
              重试
            </Button>
          }
        />
      ) : browse.isPending ? (
        <p className="text-muted-foreground p-12 text-center text-sm">正在读取…</p>
      ) : nodes.length === 0 ? (
        <StatusPanel
          icon="icon-[mingcute--folder-line]"
          title="这里没有视频"
          description="当前目录中没有文件夹或支持的视频文件"
        />
      ) : view === 'grid' ? (
        <BrowseGrid nodes={nodes} watch={watch} onOpen={enter} />
      ) : (
        <BrowseList nodes={nodes} watch={watch} onOpen={enter} />
      )}
    </>
  )
}

/** 用确定性主键批量查本机播放记录，显示进度和已看完；不读取服务器端的观看状态 */
function useWatchStates(sourceId: string, nodes: readonly BrowseNode[]) {
  const keys = useMemo(
    () =>
      nodes
        .filter((node) => node.type === 'video')
        .map((node) => ({ ref: node.ref, hash: providerHistoryKey(sourceId, node.ref) })),
    [nodes, sourceId],
  )
  return useLiveQuery(
    async () => {
      const records = await db.history.bulkGet(keys.map((key) => key.hash))
      // 以条目 ref 为键，浏览项不需要知道来源 id
      const states = new Map<string, WatchState>()
      records.forEach((record, index) => {
        if (!record || record.duration <= 0) return
        states.set(keys[index].ref, {
          ratio: Math.min(1, record.progress / record.duration),
          done: isCompleted(record.progress, record.duration),
        })
      })
      return states
    },
    [keys],
    new Map<string, WatchState>(),
  )
}

interface BrowseItemsProps {
  nodes: readonly BrowseNode[]
  watch: Map<string, WatchState>
  onOpen: (node: BrowseNode) => void
}

export function BrowseGrid({ nodes, watch, onOpen }: BrowseItemsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-6">
      {nodes.map((node) => {
        const state = watch.get(node.ref)
        return (
          <button
            key={node.ref}
            type="button"
            className="group no-drag-region min-w-0 text-left"
            onClick={() => onOpen(node)}
          >
            <div
              className={cn(
                'bg-muted relative overflow-hidden rounded-xl',
                node.wide ? 'aspect-video' : 'aspect-[2/3]',
              )}
            >
              <NodeImage node={node} />
              {state?.done && (
                <span className="bg-background/85 absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                  已看完
                </span>
              )}
              {state && !state.done && <ProgressBar ratio={state.ratio} overlay />}
            </div>
            <p className="mt-2 truncate text-sm font-medium" title={node.title}>
              {node.title}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{describe(node)}</p>
          </button>
        )
      })}
    </div>
  )
}

export function BrowseList({ nodes, watch, onOpen }: BrowseItemsProps) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      {nodes.map((node) => {
        const state = watch.get(node.ref)
        const video = node.type === 'video'
        return (
          <button
            key={node.ref}
            type="button"
            className="hover:bg-accent/60 no-drag-region flex w-full items-center gap-4 border-b px-4 py-3 text-left transition-colors last:border-0"
            onClick={() => onOpen(node)}
          >
            {node.image ? (
              <div
                className={cn(
                  'bg-muted relative shrink-0 overflow-hidden rounded-lg',
                  node.wide ? 'aspect-video w-28' : 'aspect-[2/3] w-12',
                )}
              >
                <NodeImage node={node} />
              </div>
            ) : (
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <i
                  className={cn(
                    video ? 'icon-[mingcute--video-line]' : 'icon-[mingcute--folder-line]',
                    'text-muted-foreground text-lg',
                  )}
                  aria-hidden="true"
                />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={node.title}>
                {node.type === 'video' && node.index !== undefined && (
                  <span className="text-muted-foreground mr-2 tabular-nums">
                    {String(node.index).padStart(2, '0')}
                  </span>
                )}
                {node.title}
              </span>
              {describe(node) && (
                <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                  {describe(node)}
                </span>
              )}
              {state && !state.done && (
                <span className="mt-1.5 block w-40">
                  <ProgressBar ratio={state.ratio} />
                </span>
              )}
            </span>
            {state?.done && (
              <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                <i className="icon-[mingcute--check-circle-line]" aria-hidden="true" />
                已看完
              </span>
            )}
            {!video && (
              <i
                className="icon-[mingcute--right-line] text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function describe(node: BrowseNode) {
  if (node.type === 'video') {
    const parts = [
      node.duration ? formatDuration(node.duration) : undefined,
      node.size ? formatSize(node.size) : undefined,
    ].filter(Boolean)
    return parts.join(' · ')
  }
  if (node.type === 'series') return node.year ? `剧集 · ${node.year}` : '剧集'
  if (node.type === 'season') return '季'
  if (node.type === 'collection') return '媒体库'
  return ''
}

/** 海报走 marchen://source-image 代理；加载失败时隐藏图片，露出底色和图标占位 */
function NodeImage({ node }: { node: BrowseNode }) {
  const icon =
    node.type === 'video'
      ? 'icon-[mingcute--video-line]'
      : node.type === 'folder'
        ? 'icon-[mingcute--folder-line]'
        : 'icon-[mingcute--movie-line]'
  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center">
        <i className={cn(icon, 'text-muted-foreground/60 text-3xl')} aria-hidden="true" />
      </span>
      {node.image && (
        <img
          src={node.image}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      )}
    </>
  )
}

function ProgressBar({ ratio, overlay }: { ratio: number; overlay?: boolean }) {
  return (
    <span
      className={cn(
        'block h-1 overflow-hidden rounded-full',
        overlay ? 'absolute inset-x-2 bottom-2 bg-black/40' : 'bg-muted',
      )}
      role="progressbar"
      aria-label="观看进度"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="bg-primary block h-full" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </span>
  )
}

function Crumb({
  label,
  current,
  onClick,
}: {
  label: string
  current?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'location' : undefined}
      className={cn(
        'max-w-48 truncate rounded-md px-1.5 py-1 transition-colors',
        current ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
      )}
      title={label}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function Separator() {
  return (
    <i
      className="icon-[mingcute--right-line] text-muted-foreground/60 shrink-0"
      aria-hidden="true"
    />
  )
}

function StatusPanel({
  icon,
  title,
  description,
  action,
}: {
  icon: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed p-16 text-center">
      <i className={cn(icon, 'text-muted-foreground mb-4 text-4xl')} aria-hidden="true" />
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      {action}
    </div>
  )
}
