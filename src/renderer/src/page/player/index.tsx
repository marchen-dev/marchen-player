import type { ChangeEvent, DragEvent, FC } from 'react'
import { Player } from '@renderer/components/modules/player'
import { VideoProvider } from '@renderer/components/modules/player/loading/PlayerProvider'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { checkIsVideoType, cn, isWeb } from '@renderer/lib/utils'
import { usePlayerLoadingSelector, usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { AnimatePresence, m } from 'framer-motion'
import { useCallback, useMemo, useRef } from 'react'

export default function VideoPlayer() {
  const service = usePlayerLoadingService()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 从 service state 读取当前视频 URL（playing 状态时有值）
  const url = usePlayerLoadingSelector((s) =>
    'video' in s && s.video ? s.video.url : '',
  )

  // 拖拽/点击导入
  const handleImport = useCallback(
    (e: DragEvent<HTMLDivElement> | ChangeEvent<HTMLInputElement>) => {
      e.preventDefault()
      let file: File | undefined
      if (e.type === 'drop') {
        file = (e as DragEvent<HTMLDivElement>).dataTransfer?.files[0]
      } else if (e.type === 'change') {
        file = (e as ChangeEvent<HTMLInputElement>).target?.files?.[0]
      }
      if (!file || !checkIsVideoType(file.name)) {
        return showFailedToast({ title: '格式错误', description: '请导入 mp4 或者 mkv 格式的动漫' })
      }
      service.loadFromFile(file)
    },
    [service],
  )

  // 点击导入（Electron 打开文件对话框，Web 触发 input）
  const manualImport = useCallback(async () => {
    if (isWeb) {
      return fileInputRef.current?.click()
    }
    const path = await ipcClient?.player.importAnime()
    if (path) {
      service.loadFromPath(path)
    }
  }, [service])

  const content = useMemo(
    () => (url ? <Player url={url} key={url} /> : <DragTips key={url} onClick={manualImport} />),
    [url, manualImport],
  )

  return (
    <VideoProvider>
      <div
        onDrop={handleImport}
        onDragOver={(e) => e.preventDefault()}
        className={cn('flex size-full items-center justify-center')}
      >
        <AnimatePresence>{content}</AnimatePresence>
        {!url && (
          <input
            type="file"
            accept="video/mp4, video/x-matroska"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
        )}
      </div>
    </VideoProvider>
  )
}

const DragTips: FC<{ onClick: () => void }> = ({ onClick }) => (
  <m.div
    className="flex flex-col items-center gap-2 p-12 text-gray-500"
    onClick={onClick}
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 1 }}
  >
    <i className="icon-[mingcute--video-line] text-6xl" />
    <p className="text-xl select-none">点击或拖拽动漫到此处播放</p>
  </m.div>
)
