import type { CommentModel } from '@renderer/request/models/comment'
import { atom, useSetAtom } from 'jotai'

import { atomWithReset, useResetAtom } from 'jotai/utils'

import { jotaiStore } from './store'

export const videoAtom = atomWithReset<{
  url: string
  hash: string
  size: number
  name: string
  playList: { urlWithPrefix: string; name: string }[]
}>({
  url: '',
  hash: '',
  size: 0,
  name: '',
  playList: [],
})

export enum LoadingStatus {
  IMPORT_VIDEO = 0,
  CALC_HASH = 1,
  MATCH_ANIME = 2,
  GET_DANMU = 3,
  READY_PLAY = 4,
  START_PLAY = 5,
}

export const loadingDanmuProgressAtom = atomWithReset<LoadingStatus | null>(null)

export const initialMatchedVideo = {
  episodeId: 0,
  animeTitle: '',
  episodeTitle: '',
  animeId: 0,
}

export const playerSettingSheetAtom = atomWithReset(false)

export type MatchedVideoType = typeof initialMatchedVideo

export const currentMatchedVideoAtom = atomWithReset<MatchedVideoType>(initialMatchedVideo)

export const isLoadDanmakuAtom = atom((get) => get(currentMatchedVideoAtom).episodeId !== 0)

export const isPlayingAtom = atom(
  (get) => get(loadingDanmuProgressAtom) === LoadingStatus.START_PLAY,
)
export const useSetLoadingDanmuProgress = () => useSetAtom(loadingDanmuProgressAtom)

export const useClearPlayingVideo = () => {
  const resetVideo = useResetAtom(videoAtom)
  const resetProgress = useResetAtom(loadingDanmuProgressAtom)
  const resetCurrentMatchedVideo = useResetAtom(currentMatchedVideoAtom)
  const resetPlayerSettingSheet = useResetAtom(playerSettingSheetAtom)
  const resetDanmakuData = useResetAtom(danmakuDataAtom)

  return () => {
    resetVideo()
    resetProgress()
    resetCurrentMatchedVideo()
    resetPlayerSettingSheet()
    resetDanmakuData()
  }
}

export const showPlayerSettingSheet = () => jotaiStore.set(playerSettingSheetAtom, true)

// pipeline 加载完成后写入的弹幕数据，供播放器初始化时消费
export const danmakuDataAtom = atomWithReset<CommentModel[] | null>(null)
