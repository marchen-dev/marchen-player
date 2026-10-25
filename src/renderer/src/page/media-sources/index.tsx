import type { BrowseVideoNode, MediaSourceSummary } from '@marchen/shared/media-sources'
import type { SourceFormRequest } from './SourceFormDialog'
import type { SourceCardActions } from './SourcesOverview'
import { useToast } from '@renderer/components/ui/toast'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { RouteName } from '@renderer/router/name'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { useSetAtom } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMediaSources, useRemoveMediaSource } from './api'
import { SourceBrowser } from './SourceBrowser'
import { SourceFormDialog } from './SourceFormDialog'
import { SourcesOverview } from './SourcesOverview'
import { mediaSourceLocationsAtom } from './state'

const HEADER = { title: '媒体源', actions: null }

/**
 * 媒体源 tab（仅桌面端）。当前打开的来源放在 ?source= 查询参数里：
 * 侧栏高亮按路径精确匹配，用子路由会让进入来源后侧栏失去高亮。
 */
export default function MediaSources() {
  usePageHeader(HEADER)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const service = usePlayerLoadingService()
  const confirm = useConfirmationDialog()
  const { toast } = useToast()
  const sources = useMediaSources()
  const remove = useRemoveMediaSource()
  const setLocations = useSetAtom(mediaSourceLocationsAtom)
  const [form, setForm] = useState<SourceFormRequest | null>(null)

  const list = useMemo(() => sources.data ?? [], [sources.data])
  const openedId = params.get('source')
  const opened = list.find((source) => source.id === openedId)

  const open = useCallback(
    (source: MediaSourceSummary) => {
      captureFeatureUsed('media_source', 'open_source', source.kind)
      setParams({ source: source.id })
    },
    [setParams],
  )
  const back = useCallback(() => setParams({}), [setParams])

  const play = useCallback(
    (node: BrowseVideoNode) => {
      if (!opened) return
      markNextPlayerImportSource('media_source')
      service.loadFromProvider(opened.id, node.ref)
      navigate(RouteName.PLAYER)
    },
    [navigate, opened, service],
  )

  const actions = useMemo<SourceCardActions>(
    () => ({
      onOpen: open,
      onEdit: (source) => setForm({ mode: 'edit', source }),
      onRelogin: (source) => setForm({ mode: 'relogin', source }),
      onRemove: (source) =>
        void confirm({
          title: `移除媒体源「${source.name}」？已保存的账号信息会一并删除，播放记录会保留。`,
          handleConfirm: () => {
            captureFeatureUsed('media_source', 'remove', source.kind)
            remove.mutate(source.id, {
              onSuccess: () => {
                setLocations(({ [source.id]: _, ...rest }) => rest)
                if (openedId === source.id) back()
              },
              onError: (error) =>
                toast({
                  title: '移除失败',
                  description: error instanceof Error ? error.message : undefined,
                  variant: 'destructive',
                }),
            })
          },
        }),
    }),
    [back, confirm, open, openedId, remove, setLocations, toast],
  )

  return (
    <div className="bg-background h-full overflow-y-auto px-8 py-9">
      <div className="mx-auto max-w-6xl">
        {sources.isPending ? null : sources.isError ? (
          <p role="alert" className="text-destructive p-12 text-center text-sm">
            {sources.error instanceof Error ? sources.error.message : '读取媒体源失败'}
          </p>
        ) : opened ? (
          <SourceBrowser
            key={opened.id}
            source={opened}
            onBack={back}
            onRelogin={actions.onRelogin}
            onPlay={play}
          />
        ) : (
          <SourcesOverview
            sources={list}
            onAdd={() => setForm({ mode: 'add' })}
            actions={actions}
          />
        )}
      </div>
      <SourceFormDialog
        request={form}
        onClose={() => setForm(null)}
        onSaved={(source) => {
          const added = form?.mode === 'add'
          setForm(null)
          // 新添加的来源直接进入浏览；编辑和重新登录回到原来的位置
          if (added) open(source)
        }}
      />
    </div>
  )
}
