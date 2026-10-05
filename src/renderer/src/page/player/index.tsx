import type { ChangeEvent, FC } from 'react'
import { VIDEO_FILE_ACCEPT } from '@marchen/shared/media'
import { useLabsSettingsValue } from '@renderer/atoms/settings/labs'
import { BetaBadge } from '@renderer/components/common/BetaBadge'
import { openPlaybackHistoryDialog } from '@renderer/components/modules/history/dialog-state'
import { useHasHistoryRecords } from '@renderer/components/modules/history/use-history-records'
import { VideoProvider } from '@renderer/components/modules/player/loading/PlayerProvider'
import {
  openRemoteVideoDialog,
  RemoteVideoDialog,
} from '@renderer/components/modules/player/loading/RemoteVideoDialog'
import { NativePlayer } from '@renderer/components/modules/player/NativePlayer'
import { PlaybackFailure } from '@renderer/components/modules/player/shell/PlaybackFailure'
import { VideoDropZone } from '@renderer/components/modules/shared/VideoDropZone'
import { Button } from '@renderer/components/ui/button'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { checkIsVideoType, cn, isWeb } from '@renderer/lib/utils'
import { selectFileBatch, selectPathBatch } from '@renderer/services/player-loading/file-playlist'
import {
  usePlayerLoadingSelector,
  usePlayerLoadingService,
} from '@renderer/services/player-loading/hooks'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { AnimatePresence } from 'framer-motion'
import { useCallback, useMemo, useRef } from 'react'

const PLAYER_HEADER = { title: '视频播放', actions: null }

/** 空态下方次级入口（URL 播放、播放记录）共用的按钮样式 */
const SECONDARY_ENTRY_CLASS =
  'gap-2 bg-neutral-200/60 hover:bg-neutral-200/90 dark:bg-neutral-800 dark:hover:bg-neutral-700'

export default function VideoPlayer() {
  const service = usePlayerLoadingService()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 实验室开关只控制新建入口；失败重试、更换链接和历史远程记录不受影响
  const { remoteUrlPlayback } = useLabsSettingsValue()

  // 播放记录仅桌面端提供，且至少有一条记录时才显示入口：新用户看到的空态保持不变
  const hasHistory = useHasHistoryRecords()
  const showRemoteEntry = !isWeb && remoteUrlPlayback
  const showHistoryEntry = !isWeb && hasHistory

  usePageHeader(PLAYER_HEADER)

  const preparedVideo = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.video : null,
  )

  const remoteRequest = usePlayerLoadingSelector((state) =>
    state.step === 'error' ? state.remoteRequest : undefined,
  )

  const loadError = usePlayerLoadingSelector((state) =>
    state.step === 'error' ? state.error.message : null,
  )

  // 拖拽与 Web input 共用同一格式校验和加载入口。
  const importFile = useCallback(
    (file: File | undefined, source: 'click' | 'drop') => {
      if (!file || !checkIsVideoType(file.name)) {
        return showFailedToast({
          title: '格式错误',
          description: '请选择 MP4、MKV、MOV、WebM 或 TS 等支持的视频文件',
        })
      }
      markNextPlayerImportSource(source)
      service.loadFromFile(file)
    },
    [service, showFailedToast],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      importFile(selectFileBatch(Array.from(event.target.files ?? []))[0], 'click'),
    [importFile],
  )

  // 点击导入（Electron 打开文件对话框，Web 触发 input）
  const manualImport = useCallback(async () => {
    if (isWeb) {
      return fileInputRef.current?.click()
    }
    const selected = await ipcClient?.player.importAnime()
    const path = selected && selectPathBatch(selected)[0]
    if (path) {
      markNextPlayerImportSource('click')
      service.loadFromPath(path)
    }
  }, [service])

  const content = useMemo(
    () =>
      loadError ? (
        <PlaybackFailure
          key="load-error"
          description={
            remoteRequest
              ? '视频链接无法打开，请重试或更换链接。'
              : '视频打开失败，请检查文件是否可访问，或重新选择视频。'
          }
          onRetry={
            remoteRequest && !isWeb
              ? () => service.loadFromUrl(remoteRequest.url, remoteRequest.recordId)
              : undefined
          }
          onChangeSource={
            remoteRequest && !isWeb
              ? () => openRemoteVideoDialog(remoteRequest.url, remoteRequest.recordId)
              : undefined
          }
          detail={loadError}
          onExit={() => service.cancel()}
        />
      ) : preparedVideo ? (
        <NativePlayer key={preparedVideo.hash} />
      ) : (
        <div key="empty-player" className="flex flex-col items-center gap-5">
          <DragTips onClick={manualImport} />
          {/* 次级入口并排放在提示下方；都不满足条件时整行不渲染，空态与最初一致 */}
          {(showRemoteEntry || showHistoryEntry) && (
            <div className="flex items-center gap-3">
              {showRemoteEntry && (
                <Button
                  variant="secondary"
                  className={SECONDARY_ENTRY_CLASS}
                  onClick={() => openRemoteVideoDialog()}
                >
                  通过 URL 播放
                  <BetaBadge />
                </Button>
              )}
              {showHistoryEntry && (
                <Button
                  variant="secondary"
                  className={SECONDARY_ENTRY_CLASS}
                  onClick={() => openPlaybackHistoryDialog()}
                >
                  <i aria-hidden="true" className="icon-[mingcute--history-line] text-base" />
                  播放记录
                </Button>
              )}
            </div>
          )}
        </div>
      ),
    [
      preparedVideo,
      manualImport,
      loadError,
      remoteRequest,
      service,
      showRemoteEntry,
      showHistoryEntry,
    ],
  )

  return (
    <>
      {!isWeb && <RemoteVideoDialog />}
      <VideoProvider>
        <VideoDropZone
          onFileDrop={(_file, files) => importFile(selectFileBatch(files)[0], 'drop')}
          className={cn('flex size-full items-center justify-center')}
        >
          <AnimatePresence>{content}</AnimatePresence>
          {!preparedVideo && (
            <input
              type="file"
              multiple
              accept={VIDEO_FILE_ACCEPT}
              ref={fileInputRef}
              onChange={handleInputChange}
              className="hidden"
            />
          )}
        </VideoDropZone>
      </VideoProvider>
    </>
  )
}

const DragTips: FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    className="text-muted-foreground hover:text-foreground active:text-foreground/80 focus-visible:ring-ring flex cursor-default flex-col items-center gap-2 rounded-md px-6 py-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    onClick={onClick}
  >
    <i aria-hidden="true" className="icon-[mingcute--video-line] text-6xl" />
    <p className="text-xl select-none">点击或拖拽动漫到此处播放</p>
  </button>
)
