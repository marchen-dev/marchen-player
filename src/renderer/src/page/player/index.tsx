import type { ChangeEvent, FC } from 'react'
import { VIDEO_FILE_ACCEPT } from '@marchen/shared/media'
import { useLabsSettingsValue } from '@renderer/atoms/settings/labs'
import { BetaBadge } from '@renderer/components/common/BetaBadge'
import { LogoMark } from '@renderer/components/icons/Logo'
import { openPlaybackHistoryDialog } from '@renderer/components/modules/history/dialog-state'
import { useHasHistoryRecords } from '@renderer/components/modules/history/use-history-records'
import { VideoProvider } from '@renderer/components/modules/player/loading/PlayerProvider'
import {
  openRemoteVideoDialog,
  RemoteVideoDialog,
} from '@renderer/components/modules/player/loading/RemoteVideoDialog'
import { NativePlayer } from '@renderer/components/modules/player/NativePlayer'
import { VideoDropZone } from '@renderer/components/modules/shared/VideoDropZone'
import { Button } from '@renderer/components/ui/button'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { checkIsVideoType, cn, isWeb } from '@renderer/lib/utils'
import { RouteName } from '@renderer/router/name'
import { selectFileBatch, selectPathBatch } from '@renderer/services/player-loading/file-playlist'
import {
  usePlayerLoadingSelector,
  usePlayerLoadingService,
} from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { AnimatePresence } from 'framer-motion'
import { useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'

const PLAYER_HEADER = { title: '视频播放', actions: null }

/** 空态下方次级入口（媒体源、URL 播放、播放记录）共用的按钮样式 */
const SECONDARY_ENTRY_CLASS = 'gap-2 bg-muted hover:bg-accent'

export default function VideoPlayer() {
  const service = usePlayerLoadingService()
  const navigate = useNavigate()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 实验室开关只控制新建入口；失败重试、更换链接和历史远程记录不受影响
  const { remoteUrlPlayback } = useLabsSettingsValue()

  // 播放记录仅桌面端提供，且至少有一条记录时才显示入口：新用户看到的空态保持不变
  const hasHistory = useHasHistoryRecords()
  const showRemoteEntry = !isWeb && remoteUrlPlayback
  const showHistoryEntry = !isWeb && hasHistory
  // 媒体源只在桌面端提供
  const showMediaSourceEntry = !isWeb

  usePageHeader(PLAYER_HEADER)

  const preparedVideo = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.video : null,
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
      preparedVideo ? (
        <NativePlayer key={preparedVideo.hash} />
      ) : (
        <div key="empty-player" className="flex flex-col items-center gap-5">
          <DragTips onClick={manualImport} />
          {/* 次级入口并排放在提示下方；都不满足条件时整行不渲染，空态与最初一致 */}
          {(showRemoteEntry || showHistoryEntry || showMediaSourceEntry) && (
            <div className="flex items-center gap-3">
              {showMediaSourceEntry && (
                <Button
                  variant="secondary"
                  className={SECONDARY_ENTRY_CLASS}
                  onClick={() => {
                    captureFeatureUsed('media_source', 'open_from_player')
                    navigate(RouteName.MEDIA_SOURCES)
                  }}
                >
                  <i aria-hidden="true" className="icon-[mingcute--server-line] text-base" />
                  从媒体源打开
                </Button>
              )}
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
      showRemoteEntry,
      showHistoryEntry,
      showMediaSourceEntry,
      navigate,
    ],
  )

  return (
    <>
      {!isWeb && <RemoteVideoDialog />}
      {/* 加载失败界面由 VideoProvider 内的进度界面原地呈现，本地文件可重新选择 */}
      <VideoProvider onReselect={manualImport}>
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
    className="group text-muted-foreground hover:text-foreground active:text-foreground/80 focus-visible:ring-ring flex cursor-default flex-col items-center gap-2 rounded-md px-6 py-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    onClick={onClick}
  >
    {/* 平时与文字同为灰色，悬停或键盘聚焦时只让猫耳变为品牌蓝，品牌色只在用户操作时出现；
        变色时播放三角同步填白，与应用图标一致，避免深色主题下三角成为黑洞 */}
    <LogoMark
      className="group-hover:text-brand group-focus-visible:text-brand text-6xl transition-colors duration-150"
      triangleClassName="transition-colors duration-150 group-hover:fill-white group-focus-visible:fill-white"
    />
    <p className="text-xl select-none">点击或拖拽视频到此处播放</p>
  </button>
)
