import type { MatchedVideoType } from '@renderer/atoms/player'
import type { MatchResponseV2 } from '@renderer/request/models/match'
import type { FC, PropsWithChildren } from 'react'
import {
  currentMatchedVideoAtom,
  danmakuDataAtom,
  loadingDanmuProgressAtom,
  LoadingStatus,
  useClearPlayingVideo,
} from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { MatchAnimeDialog } from '@renderer/components/modules/player/loading/dialog/MatchAnimeDialog'
import { LoadingDanmuTimeLine } from '@renderer/components/modules/player/loading/Timeline'
import { db } from '@renderer/database/db'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { mergeDanmaku } from '@renderer/lib/danmaku'
import { useAtom, useAtomValue } from 'jotai'

import { useEffect, useRef, useState } from 'react'

import {
  continuePipeline,
  saveToHistory,
  startMatchAndLoad,
  useLoadingHistoricalAnime,
  useVideo,
} from './hooks'

export const VideoProvider: FC<PropsWithChildren> = ({ children }) => {
  useLoadingHistoricalAnime()
  const { video } = useVideo()
  const { hash, url, size, name } = video
  const [loadingProgress, setLoadingProgress] = useAtom(loadingDanmuProgressAtom)
  const currentMatchedVideo = useAtomValue(currentMatchedVideoAtom)
  const clearPlayingVideo = useClearPlayingVideo()
  const { showFailedToast } = usePlayAnimeFailedToast()

  // 未精准匹配时的 matchData，用于弹出对话框
  const [pendingMatchData, setPendingMatchData] = useState<MatchResponseV2 | null>(null)
  const pipelineTriggered = useRef(false)

  // 当 hash 就绪时触发 pipeline
  useEffect(() => {
    if (!hash || !size || !name || loadingProgress !== LoadingStatus.CALC_HASH) {
      return
    }
    if (pipelineTriggered.current) return
    pipelineTriggered.current = true

    const runPipeline = async () => {
      try {
        const matchData = await startMatchAndLoad(hash, size, name, url)
        if (matchData) {
          setPendingMatchData(matchData)
        }
      } catch (error) {
        console.error('Pipeline 执行失败:', error)
        showFailedToast({ title: '匹配失败', description: '请检查网络连接或稍后再试' })
        clearPlayingVideo()
      }
    }
    runPipeline()
  }, [hash, loadingProgress])

  // hash 变化时重置 pipeline 状态
  useEffect(() => {
    pipelineTriggered.current = false
    setPendingMatchData(null)
  }, [hash])

  // 加载中：显示 stepper + 对话框
  if (loadingProgress !== null && loadingProgress < LoadingStatus.START_PLAY) {
    return (
      <>
        <LoadingDanmuTimeLine />
        <MatchAnimeDialog
          matchData={currentMatchedVideo.episodeId ? undefined : (pendingMatchData ?? undefined)}
          onSelected={async (params?: MatchedVideoType) => {
            // 用户选择不加载弹幕
            if (!params) {
              const history = await db.history.get(hash)
              const localDanmaku = history?.danmaku?.filter((item) => item.type === 'local') ?? []
              if (localDanmaku.length > 0) {
                const merged = mergeDanmaku(localDanmaku)
                jotaiStore.set(danmakuDataAtom, merged ?? null)
              }
              await saveToHistory({ hash, path: url, animeTitle: name })
              return setLoadingProgress(LoadingStatus.START_PLAY)
            }
            // 用户选择了弹幕库，继续 pipeline
            await continuePipeline({ ...params, hash, url })
          }}
          onClosed={clearPlayingVideo}
          isLoading
        />
      </>
    )
  }
  return children
}
