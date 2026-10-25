import type {
  BrowseResult,
  MediaSourceInput,
  MediaSourceKind,
  MediaSourceResult,
  MediaSourceSummary,
} from '@marchen/shared/media-sources'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { ipcClient } from '@renderer/lib/client'
import { telemetry } from '@renderer/services/telemetry/client'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const SOURCES_KEY = ['media-sources'] as const
export const browseKey = (sourceId: string, ref: string | null) =>
  ['media-sources', sourceId, 'browse', ref] as const

/** IPC 结果转为异常：错误码保留在 MediaSourceError.code，界面据此选择提示 */
async function unwrap<T>(call: Promise<MediaSourceResult<T>> | undefined): Promise<T> {
  const result = await call
  if (!result) throw new MediaSourceError('invalid_input', '媒体源仅在桌面版可用')
  if (!result.ok) throw new MediaSourceError(result.code, result.message)
  return result.value
}

export const errorCodeOf = (error: unknown) =>
  error instanceof MediaSourceError ? error.code : undefined

export function useMediaSources() {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => unwrap(ipcClient?.mediaSources.list()),
    staleTime: 0,
  })
}

export function useBrowse(source: MediaSourceSummary | undefined, ref: string | null) {
  const client = useQueryClient()
  return useQuery({
    queryKey: browseKey(source?.id ?? '', ref),
    enabled: Boolean(source) && !source?.needsLogin,
    retry: false,
    queryFn: async (): Promise<BrowseResult> => {
      try {
        return await unwrap(ipcClient?.mediaSources.browse({ sourceId: source!.id, ref }))
      } catch (error) {
        const code = errorCodeOf(error) ?? 'invalid_response'
        // 主进程已把来源标记为需要重新登录，刷新列表让卡片和浏览页切到重新登录状态
        if (code === 'auth_failed') void refreshMediaSources(client)
        telemetry.capture('media_source_browse_failed', {
          provider: source!.kind,
          error_code: code,
        })
        reportOperationalError('ipc', 'media_source_browse', error)
        throw error
      }
    },
  })
}

type SaveAction =
  | { action: 'add'; input: MediaSourceInput }
  | { action: 'update'; id: string; input: MediaSourceInput }
  | { action: 'relogin'; id: string; kind: MediaSourceKind; password: string }

export function useSaveMediaSource() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (request: SaveAction): Promise<MediaSourceSummary> => {
      const provider = request.action === 'relogin' ? request.kind : request.input.kind
      try {
        const summary = await unwrap(
          request.action === 'add'
            ? ipcClient?.mediaSources.add(request.input)
            : request.action === 'update'
              ? ipcClient?.mediaSources.update({ id: request.id, input: request.input })
              : ipcClient?.mediaSources.relogin({ id: request.id, password: request.password }),
        )
        telemetry.capture('media_source_saved', {
          provider,
          action: request.action,
          result: 'success',
        })
        return summary
      } catch (error) {
        telemetry.capture('media_source_saved', {
          provider,
          action: request.action,
          result: 'failed',
          error_code: errorCodeOf(error) ?? 'invalid_response',
        })
        reportOperationalError('ipc', `media_source_${request.action}`, error)
        throw error
      }
    },
    onSuccess: (summary) => {
      // 凭证或地址可能变了，丢弃该来源的浏览缓存
      void client.invalidateQueries({ queryKey: SOURCES_KEY })
      client.removeQueries({ queryKey: ['media-sources', summary.id] })
    },
  })
}

export function useRemoveMediaSource() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await unwrap(ipcClient?.mediaSources.remove({ id }))
      } catch (error) {
        reportOperationalError('ipc', 'media_source_remove', error)
        throw error
      }
    },
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: ['media-sources', id] })
      void client.invalidateQueries({ queryKey: SOURCES_KEY })
    },
  })
}

/** 来源返回 401 后主进程已标记需要重新登录，刷新列表让界面切到重新登录状态 */
export const refreshMediaSources = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: SOURCES_KEY, exact: true })
