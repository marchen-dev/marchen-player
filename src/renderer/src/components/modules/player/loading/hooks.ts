import { MARCHEN_PROTOCOL_PREFIX } from '@main/constants/protocol'
import {
  currentMatchedVideoAtom,
  isLoadDanmakuAtom,
  loadingDanmuProgressAtom,
  LoadingStatus,
  useClearPlayingVideo,
  videoAtom,
} from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { db } from '@renderer/database/db'
import type { DB_Danmaku, DB_History } from '@renderer/database/schemas/history'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { calculateFileHash } from '@renderer/lib/calc-file-hash'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import { apiClient } from '@renderer/request'
import type { MatchResponseV2 } from '@renderer/request/models/match'
import { RouteName } from '@renderer/router'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

export const useVideo = () => {
  const [video, setVideo] = useAtom(videoAtom)
  const setProgress = useSetAtom(loadingDanmuProgressAtom)
  const { showFailedToast } = usePlayAnimeFailedToast()
  const clearPlayingVideo = useClearPlayingVideo()

  // 对于浏览器环境，当通过拖拽或者点击导入视频时，会触发该函数
  // 对于 electron 环境，通过拖拽导入时，会触发该函数
  const importAnimeViaDragging = async (
    e: DragEvent<HTMLDivElement> | ChangeEvent<HTMLInputElement>,
  ) => {
    e.preventDefault()
    clearPlayingVideo()
    setProgress(LoadingStatus.IMPORT_VIDEO)
    let file: File | undefined
    if (e.type === 'drop') {
      const dragEvent = e as DragEvent<HTMLDivElement>
      file = dragEvent.dataTransfer?.files[0]
    } else if (e.type === 'change') {
      const changeEvent = e as ChangeEvent<HTMLInputElement>
      file = changeEvent.target?.files?.[0]
    }

    if (!file || !file?.type.startsWith('video/')) {
      return showFailedToast({ title: '格式错误', description: '请导入 mp4 或者 mkv 格式的动漫' })
    }

    let url = ''
    let playList: {
      urlWithPrefix: string
      name: string
    }[] = []

    if (isWeb) {
      url = URL.createObjectURL(file)
    } else {
      const path = window.api.showFilePath(file)
      playList = (await tipcClient?.getAnimeInSamePath({ path })) ?? []
      url = `${MARCHEN_PROTOCOL_PREFIX}${path}`
      tipcClient?.addRecentDocument({ path })
    }
    const { size, name } = file
    const fileName = name.slice(0, Math.max(0, name.lastIndexOf('.'))) || name
    try {
      const hash = await calculateFileHash(file)
      setVideo((prev) => ({ ...prev, url, hash, size, name: fileName, playList }))
      setProgress(LoadingStatus.CALC_HASH)
    } catch (error) {
      console.error('Failed to calculate file hash:', error)
      showFailedToast({ title: '播放失败', description: '计算视频 hash 值出现异常，请重试' })
    }
  }

  // 只在 electron 环境生效，点击导入视频时，会触发该函数
  const importAnimeViaIPC = useCallback(async (params?: { path?: string }) => {
    clearPlayingVideo()
    const path = params?.path ?? (await tipcClient?.importAnime())
    if (!path) {
      return
    }
    const playList = (await tipcClient?.getAnimeInSamePath({ path })) ?? []
    const animeData = await tipcClient?.getAnimeDetailByPath({ path })
    if (!animeData?.ok) {
      showFailedToast({ title: '播放失败', description: animeData?.message || '' })
      return
    }
    const { fileHash, fileName, fileSize, filePath } = animeData
    if (!fileHash || !fileHash || !fileSize) {
      showFailedToast({ title: '播放失败', description: '无法读取视频' })
      return
    }
    setVideo((prev) => ({
      ...prev,
      url: filePath,
      hash: fileHash,
      size: fileSize,
      name: fileName,
      playList,
    }))
    tipcClient?.addRecentDocument({ path: filePath })
    setProgress(LoadingStatus.CALC_HASH)
  }, [])
  return {
    importAnimeViaDragging,
    importAnimeViaIPC,
    video,
  }
}

// 匹配动漫
export const useMatchAnimeData = () => {
  const { hash, size, name, url } = useAtomValue(videoAtom)
  const clearPlayingVideo = useClearPlayingVideo()
  const location = useLocation()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const setCurrentMatchedVideo = useSetAtom(currentMatchedVideoAtom)
  const setLoadingProgress = useSetAtom(loadingDanmuProgressAtom)

  // 先直接通过 hash 去匹配，如果匹配失败，则弹出匹配框，让用户选择
  const { data: matchData, isError } = useQuery({
    queryKey: [apiClient.match.Matchkeys.postVideoEpisodeId, hash],
    queryFn: async () => {
      const historyData = await db.history.get(hash)
      // 如果历史记录中有匹配的数据，直接返回
      if (historyData?.episodeId && historyData?.animeId) {
        const { episodeId, episodeTitle, animeId, animeTitle } = historyData
        return {
          isMatched: true,
          matches: [{ episodeTitle, episodeId, animeId, animeTitle }],
        } satisfies MatchResponseV2
      }
      return apiClient.match.postVideoEpisodeId({ fileSize: size, fileHash: hash, fileName: name })
    },
    enabled: !!hash,
  })

  const matchedVideo = useMemo(() => {
    // 确保为精准匹配
    if (!matchData || !matchData.matches || !matchData.isMatched) {
      return null
    }
    const matchedVideo = matchData?.matches[0]
    return {
      episodeId: matchedVideo.episodeId,
      animeTitle: matchedVideo.animeTitle || '',
      animeId: matchedVideo.animeId,
      episodeTitle: matchedVideo.episodeTitle || '',
    }
  }, [matchData])

  useEffect(() => {
    // 如果精准匹配，就去设置 setCurrentMatchedVideo(matchedVideo)，之后就会触发 useDanmuData() 里的 useQuery 和 useEffect
    if (matchData && matchedVideo) {
      setCurrentMatchedVideo(matchedVideo)
      setLoadingProgress(LoadingStatus.MATCH_ANIME)
    }
  }, [matchData])

  useEffect(() => {
    if (isError) {
      showFailedToast({ title: '匹配失败', description: '请检查网络连接或稍后再试' })
      clearPlayingVideo()
    }
  }, [location.pathname, isError])

  return { matchData, url, clearPlayingVideo }
}

export const useDanmakuData = () => {
  const isLoadDanmaku = useAtomValue(isLoadDanmakuAtom)
  const video = useAtomValue(videoAtom)
  const { enableTraditionalToSimplified } = usePlayerSettingsValue()
  const [currentMatchedVideo] = useAtom(currentMatchedVideoAtom)

  const { data: thirdPartyDanmakuUrlData } = useQuery({
    queryKey: [
      apiClient.related.relatedkeys.getRelatedDanmakuByEpisodeId,
      currentMatchedVideo.episodeId,
    ],
    queryFn: () => apiClient.related.getRelatedDanmakuByEpisodeId(currentMatchedVideo.episodeId),
    enabled: isLoadDanmaku && !!currentMatchedVideo.episodeId,
  })

  const onlyLoadDandanplayDanmaku = !thirdPartyDanmakuUrlData?.relateds.length
  // setCurrentMatchedVideo() 之后会触发该 useQuery, 获取弹幕数据
  // 目前共两种可能性会触发该 useQuery
  // 1. 上方 useMatchAnimeData() 为精准匹配
  // 2. 用户通过对话框, 手动匹配了弹幕库
  // 获取弹幕数据后，会触发下发 useEffect

  const danmakuData = useQueries({
    queries: [
      ...(thirdPartyDanmakuUrlData?.relateds.map((related) => ({
        queryKey: [apiClient.comment.Commentkeys.getExtcomment, video.hash, related.url],
        queryFn: async () => {
          const fetchData = await apiClient.comment.getExtcomment({ url: related.url })
          const history = await db.history.get(video.hash)
          const historyDanmaku = history?.danmaku?.find((item) => item.source === related.url)
          return {
            ...fetchData,
            selected: historyDanmaku?.selected ?? true,
          }
        },
        enabled: !!currentMatchedVideo.episodeId && !onlyLoadDandanplayDanmaku,
      })) ?? []),
      {
        queryKey: [apiClient.comment.Commentkeys.getDanmu, video.hash],
        queryFn: async () => {
          const fetchData = await apiClient.comment.getDanmu(+currentMatchedVideo.episodeId, {
            chConvert: enableTraditionalToSimplified ? 1 : 0,
          })
          const history = await db.history.get(video.hash)
          const historyDanmaku = history?.danmaku?.find((item) => item.source === 'dandanplay')

          return {
            ...fetchData,
            selected: historyDanmaku?.selected ?? true,
          }
        },
        enabled: !!currentMatchedVideo.episodeId,
      },
    ],
    combine: (results) => {
      const dandanplayDanmakuData = {
        type: 'dandanplay',
        source: 'dandanplay',
        content: results.at(-1)?.data,
        selected: results.at(-1)?.data?.selected,
      } as DB_Danmaku

      const thirdPartyDanmakuData = results.slice(0, -1).map((result, index) => ({
        type: 'third-party-auto',
        content: result.data,
        source: thirdPartyDanmakuUrlData?.relateds[index].url,
        selected: result.data?.selected,
      })) as DB_Danmaku[]

      // 只加载官方弹幕库，返回弹幕数据
      if (onlyLoadDandanplayDanmaku && dandanplayDanmakuData.content) {
        return [dandanplayDanmakuData]
      }

      // 官方弹幕库和第三方弹幕库都加载成功后，返回所有弹幕数据
      if (!onlyLoadDandanplayDanmaku && results.every((result) => result.data !== undefined)) {
        return [dandanplayDanmakuData, ...thirdPartyDanmakuData]
      }

      return
    },
  })

  const mergedDanmakuData = useMemo(() => {
    if (!danmakuData) {
      return
    }
    return danmakuData
      .filter((danmaku) => danmaku.selected)
      .map((danmaku) => danmaku?.content)
      .flatMap((danmaku) => danmaku.comments)
  }, [danmakuData])

  return {
    danmakuData,
    mergedDanmakuData,
  }
}

export const saveToHistory = async (
  params: Omit<DB_History, 'cover' | 'updatedAt' | 'progress' | 'duration'>,
) => {
  const { animeId, hash } = params
  const existingAnime = await db.history.where({ hash }).first()
  const historyData = {
    ...params,
    updatedAt: new Date().toISOString(),
  }
  if (!existingAnime) {
    return await db.history.add({
      ...historyData,
      progress: 0,
      duration: 0,
    })
  }
  if (animeId) {
    const { bangumi } = await apiClient.bangumi.getBangumiDetailById(animeId)

    Object.assign(historyData, {
      cover: bangumi.imageUrl,
    })
    // const manualDanmaku = existingAnime?.danmaku?.filter(
    //   (item) => item.type === 'local' || item.type === 'third-party-manual',
    // )
    // historyData.danmaku?.push(...manualDanmaku || [])
    // 确保能够对不同集进行更新
    const oldEspisode = params.episodeId === existingAnime.episodeId
    await db.history.update(existingAnime.hash, {
      ...historyData,
      ...(oldEspisode && { duration: existingAnime.duration, progress: existingAnime.progress }),
    })
    return
  } else {
    await db.history.update(existingAnime.hash, historyData)
    return
  }
}

export const useLoadingHistoricalAnime = () => {
  const clearPlayingVideo = useClearPlayingVideo()
  const setVideo = useSetAtom(videoAtom)
  const location = useLocation()
  const navigate = useNavigate()
  const setProgress = useSetAtom(loadingDanmuProgressAtom)
  const effectOnce = useRef(false)
  const { showFailedToast } = usePlayAnimeFailedToast()
  const episodeId = location.state?.episodeId
  const hash = location.state?.hash

  const handleDeleteHistory = useCallback(async (hash: string) => {
    try {
      db.history.delete(hash)
    } catch (error) {
      console.error('Failed to delete history:', error)
    }
  }, [])

  const loadingAnime = useCallback(async () => {
    clearPlayingVideo()
    const anime = await db.history.get({ hash })
    if (!anime || Array.isArray(anime)) {
      showFailedToast({ title: '播放失败', description: '未找到历史记录' })
      return
    }

    const animeData = await tipcClient?.getAnimeDetailByPath({ path: anime.path })
    if (!animeData?.ok) {
      showFailedToast({ title: '播放失败', description: animeData?.message || '未找到历史记录' })
      handleDeleteHistory(anime.hash)
      return
    }
    const { fileName, fileSize, fileHash } = animeData
    if (!fileHash || !fileName || !fileSize) {
      showFailedToast({ title: '播放失败', description: '未找到历史记录' })
      handleDeleteHistory(anime.hash)
      return
    }

    const playList = (await tipcClient?.getAnimeInSamePath({ path: anime.path })) ?? []
    setVideo({
      hash: fileHash,
      name: fileName,
      size: fileSize,
      url: anime.path,
      playList,
    })
    tipcClient?.addRecentDocument({ path: anime.path })
    setProgress(LoadingStatus.CALC_HASH)
  }, [episodeId, hash])

  useEffect(() => {
    if (!effectOnce.current) {
      effectOnce.current = true
      navigate(location.pathname, { replace: true })
      if (hash && location.pathname === RouteName.PLAYER) {
        loadingAnime()
      }
    }
  }, [loadingAnime])

  useEffect(() => {
    if (hash && location.pathname === RouteName.PLAYER) {
      setProgress(LoadingStatus.IMPORT_VIDEO)
    }
  }, [hash])
}
