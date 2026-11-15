import type { MediaSourceKind, MediaSourceSummary } from '@marchen/shared/media-sources'
import { MEDIA_SOURCE_KIND_LABELS } from '@marchen/shared/media-sources'
import { Button } from '@renderer/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/menu'
import { describeError } from '@renderer/lib/errors'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { useBrowse } from './api'

const KIND_ICON: Record<MediaSourceKind, string> = {
  webdav: 'icon-[mingcute--folder-2-line]',
  jellyfin: 'icon-[mingcute--server-line]',
  emby: 'icon-[mingcute--server-line]',
}

export interface SourceCardActions {
  onOpen: (source: MediaSourceSummary) => void
  onEdit: (source: MediaSourceSummary) => void
  onRelogin: (source: MediaSourceSummary) => void
  onRemove: (source: MediaSourceSummary) => void
}

interface SourcesOverviewProps {
  sources: MediaSourceSummary[]
  onAdd: () => void
  actions: SourceCardActions
}

export function SourcesOverview({ sources, onAdd, actions }: SourcesOverviewProps) {
  const { t } = useTranslation('mediaSources')
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{t('overview.title')}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t('overview.subtitle')}</p>
        </div>
        {sources.length > 0 && (
          <Button className="rounded-full" onClick={onAdd}>
            <i className="icon-[mingcute--add-line] mr-2" />
            {t('overview.add')}
          </Button>
        )}
      </header>
      {sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center">
          <i className="icon-[mingcute--server-line] text-muted-foreground mb-4 text-4xl" />
          <h2 className="text-lg font-medium">{t('overview.emptyTitle')}</h2>
          <p className="text-muted-foreground mt-2 text-sm">{t('overview.emptyDescription')}</p>
          <Button className="mt-5 rounded-full" onClick={onAdd}>
            <i className="icon-[mingcute--add-line] mr-2" />
            {t('overview.add')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} actions={actions} />
          ))}
        </div>
      )}
    </>
  )
}

function SourceCard({
  source,
  actions,
}: {
  source: MediaSourceSummary
  actions: SourceCardActions
}) {
  const { t } = useTranslation(['mediaSources', 'common'])
  // 根目录查询兼作连接状态探测，结果也会被浏览页直接复用
  const root = useBrowse(source, null)
  const status = source.needsLogin
    ? { tone: 'warn', text: t('overview.status.needsLogin') }
    : root.isError
      ? {
          tone: 'error',
          text: describeError(root.error, t('overview.status.failed'), { domain: 'mediaSource' }),
        }
      : root.isPending
        ? { tone: 'muted', text: t('overview.status.connecting') }
        : {
            tone: 'ok',
            text:
              source.kind === 'webdav'
                ? t('overview.status.items', { count: root.data.nodes.length })
                : t('overview.status.libraries', { count: root.data.nodes.length }),
          }

  const open = () => (source.needsLogin ? actions.onRelogin(source) : actions.onOpen(source))

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <article className="bg-card hover:bg-accent/50 no-drag-region relative flex flex-col rounded-2xl border p-5 transition-colors">
          {/* 按钮的 ::after 铺满整张卡片，点状态行或留白也能进入；重试、重新登录按钮叠在上层 */}
          <button
            type="button"
            className="flex items-start gap-4 text-left after:absolute after:inset-0 after:rounded-2xl"
            onClick={open}
          >
            <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
              <i className={cn(KIND_ICON[source.kind], 'text-xl')} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{source.name}</span>
              <span className="text-muted-foreground mt-1 block truncate text-xs">
                {MEDIA_SOURCE_KIND_LABELS[source.kind]} · {source.url}
              </span>
            </span>
          </button>
          <div className="mt-4 flex min-h-8 items-center justify-between gap-2 text-xs">
            <span
              className={cn(
                'flex min-w-0 items-center gap-1.5',
                status.tone === 'error' && 'text-destructive',
                status.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                (status.tone === 'muted' || status.tone === 'ok') && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  status.tone === 'ok' && 'bg-emerald-500',
                  status.tone === 'error' && 'bg-destructive',
                  status.tone === 'warn' && 'bg-amber-500',
                  status.tone === 'muted' && 'bg-muted-foreground/50',
                )}
              />
              <span className="truncate" title={status.text}>
                {status.text}
              </span>
            </span>
            {source.needsLogin ? (
              <Button
                size="sm"
                variant="secondary"
                className="relative z-10"
                onClick={() => actions.onRelogin(source)}
              >
                {t('overview.relogin')}
              </Button>
            ) : (
              root.isError && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="relative z-10"
                  disabled={root.isFetching}
                  onClick={() => void root.refetch()}
                >
                  <i className="icon-[mingcute--refresh-2-line] mr-1" aria-hidden="true" />
                  {t('common:action.retry')}
                </Button>
              )
            )}
          </div>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem disabled={source.needsLogin} onSelect={() => actions.onOpen(source)}>
          <i className="icon-[mingcute--folder-open-line] mr-2 size-4" />
          {t('overview.menu.browse')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onEdit(source)}>
          <i className="icon-[mingcute--edit-2-line] mr-2 size-4" />
          {t('overview.menu.edit')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onRelogin(source)}>
          <i className="icon-[mingcute--key-2-line] mr-2 size-4" />
          {t('overview.menu.relogin')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => actions.onRemove(source)}
        >
          <i className="icon-[mingcute--delete-2-line] mr-2 size-4" />
          {t('overview.menu.remove')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
