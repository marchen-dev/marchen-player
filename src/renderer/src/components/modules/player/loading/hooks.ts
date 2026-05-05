import type { DB_Danmaku, DB_History } from '@renderer/database/schemas/history'
import type { MatchResponseV2 } from '@renderer/request/models/match'
import type { ChangeEvent, DragEvent } from 'react'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'
import {
  currentMatchedVideoAtom,
  danmakuDataAtom,
  loadingDanmuProgressAtom,
  LoadingStatus,
  useClearPlayingVideo,
  videoAtom,
} from '@renderer/atoms/player'
import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { db } from '@renderer/database/db'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { mergeDanmaku } from '@renderer/lib/danmaku'
import { checkIsVideoType, isWeb } from '@renderer/lib/utils'
import { apiClient } from '@renderer/request'
import { RouteName } from '@renderer/router'

import { useAtom, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

// --- Pipeline 核心：async 函数，通过 jotaiStore.set 更新状态 ---

// 当前 pipeline 的 AbortController，用于取消正在进行的加载
let currentAbortController: AbortController | null = null

/**
 * 取消当前正在进行的 pipeline
 */
export const cancelPipeline = () => {
  currentAbortController?.abort()
  currentAbortController = null
}

/**
 * 读取用户的繁简转换设置（从 jotai atom 读取，非 hook 环境）
 */
const getChConvert = (): number => {
  const settings = jotaiStore.get(playerSettingAtom)
  return settings.enableTraditionalToSimplified ? 1 : 0
}

/**
 * 匹配动漫：先查本地缓存，再调 API
 */
const matchAnime = async (hash: string, size: number, name: string): Promise<MatchResponseV2> => {
  const historyData = await db.history.get(hash)
  // 如果历史记录中有匹配数据，直接返回
  if (historyData?.episodeId && historyData?.animeId) {
    const { episodeId, episodeTitle, animeId, animeTitle } = historyData
    return {
      isMatched: true,
      matches: [{ episodeTitle, episodeId, animeId, animeTitle }],
    } satisfies MatchResponseV2
  }
  return apiClient.match.postVideoEpisodeId({ fileSize: size, fileHash: hash, fileName: name })
}

/**
 * 获取弹幕：优先使用缓存，新番或无缓存时重新请求
 * 也被 MatchDanmakuDialog 在播放中重新匹配时调用
 * @param forceRefresh 强制跳过缓存重新请求（重新匹配弹幕库时使用）
 */
export const fetchDanmakuForEpisode = async (
  episodeId: number,
  hash: string,
  forceRefresh = false,
): Promise<DB_Danmaku[]> => {
  const history = await db.history.get(hash)

  // 检查是否有可用的弹幕缓存（非新番且非强制刷新时使用缓存）
  if (!forceRefresh) {
    const autoDanmaku = history?.danmaku?.find((item) => item.type === 'auto')
    if (autoDanmaku && !history?.newBangumi) {
      return history!.danmaku!
    }
  }

  // 请求新弹幕，withRelated=true 包含所有第三方源
  const chConvert = getChConvert()
  const fetchData = await apiClient.comment.getDanmu(episodeId, {
    withRelated: true,
    chConvert,
  })

  // 构建新的弹幕数据，保留已有的 local 弹幕
  const localDanmaku = history?.danmaku?.filter((item) => item.type === 'local') ?? []
  const newDanmaku: DB_Danmaku[] = [
    { type: 'auto', source: 'dandanplay', content: fetchData, selected: true },
    ...localDanmaku,
  ]

  return newDanmaku
}

/**
 * Pipeline 第二段：获取弹幕 → 保存历史 → 开始播放
 * 当用户从对话框选择了动漫后调用
 */
export const continuePipeline = async (params: {
  episodeId: number
  animeTitle: string
  episodeTitle: string
  animeId: number
  hash: string
  url: string
}) => {
  const { episodeId, animeTitle, episodeTitle, animeId, hash, url } = params

  // 更新匹配状态
  jotaiStore.set(currentMatchedVideoAtom, { episodeId, animeTitle, episodeTitle, animeId })
  jotaiStore.set(loadingDanmuProgressAtom, LoadingStatus.MATCH_ANIME)

  try {
    // 获取弹幕
    const danmakuData = await fetchDanmakuForEpisode(episodeId, hash)
    jotaiStore.set(loadingDanmuProgressAtom, LoadingStatus.GET_DANMU)

    // 合并选中的弹幕用于播放器渲染
    const mergedComments = mergeDanmaku(danmakuData)
    jotaiStore.set(danmakuDataAtom, mergedComments ?? null)

    // 保存到历史记录
    await saveToHistory({
      hash,
      path: url,
      episodeId,
      animeTitle,
      episodeTitle,
      animeId,
      danmaku: danmakuData,
    })

    // 准备播放
    jotaiStore.set(loadingDanmuProgressAtom, LoadingStatus.READY_PLAY)
    setTimeout(() => {
      jotaiStore.set(loadingDanmuProgressAtom, LoadingStatus.START_PLAY)
    }, 100)
  } catch (error) {
    console.error('获取弹幕失败:', error)
    // 弹幕获取失败时仍然允许播放（无弹幕）
    await saveToHistory({ hash, path: url, animeTitle })
    jotaiStore.set(loadingDanmuProgressAtom, LoadingStatus.START_PLAY)
  }
}

/**
 * Pipeline 第一段：hash → match → 如果精准匹配则继续获取弹幕
 * 返回 matchData 供 PlayerProvider 判断是否需要弹出对话框
 */
export const startMatchAndLoad = async (hash: string, size: number, name: string, url: string) => {
  cancelPipeline()
  currentAbortController = new AbortController()

  try {
    const matchData = await matchAnime(hash, size, name)

    // 检查是否被取消
    if (currentAbortController?.signal.aborted) return null

    // 精准匹配：自动继续 pipeline
    if (matchData.isMatched && matchData.matches?.[0]) {
      const matched = matchData.matches[0]
      await continuePipeline({
        episodeId: matched.episodeId,
        animeTitle: matched.animeTitle || '',
        episodeTitle: matched.episodeTitle || '',
        animeId: matched.animeId,
        hash,
        url,
      })
      return null
    }

    // 未精准匹配：返回 matchData，由 PlayerProvider 弹出对话框
    return matchData
  } catch (error) {
    if (currentAbortController?.signal.aborted) return null
    throw error
  }
}

export const useVideo = () => {
  const [video, setVideo] = useAtom(videoAtom)
  const setProgress = useSetAtom(loadingDanmuProgressAtom)
  const { showFailedToast } = usePlayAnimeFailedToast()
  const clearPlayingVideo = useClearPlayingVideo()

  // 浏览器环境拖拽/点击导入，Electron 环境拖拽导入
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

    if (!file || !checkIsVideoType(file.name)) {
      return showFailedToast({ title: '格式错误', description: '请导入 mp4 或者 mkv 格式的动漫' })
    }

    let url = ''
    let playList: { urlWithPrefix: string; name: string }[] = []

    if (isWeb) {
      url = URL.createObjectURL(file)
    } else {
      const path = window.api.showFilePath(file)
      playList = (await ipcClient?.player.getAnimeInSamePath({ path })) ?? []
      url = `${MARCHEN_PROTOCOL_PREFIX}${path}`
      ipcClient?.app.addRecentDocument({ path })
    }
    const { size, name: fileName } = file
    try {
      const hash = await calculateFileHash(file)
      setVideo((prev) => ({ ...prev, url, hash, size, name: fileName, playList }))
      setProgress(LoadingStatus.CALC_HASH)
    } catch (error) {
      console.error('Failed to calculate file hash:', error)
      showFailedToast({ title: '播放失败', description: '计算视频 hash 值出现异常，请重试' })
    }
  }

  // Electron 环境点击导入或通过 IPC 导入
  const importAnimeViaIPC = useCallback(async (params?: { path?: string }) => {
    clearPlayingVideo()
    const path = params?.path ?? (await ipcClient?.player.importAnime())
    if (!path) {
      return
    }
    const playList = (await ipcClient?.player.getAnimeInSamePath({ path })) ?? []
    const animeData = await ipcClient?.player.getAnimeDetailByPath({ path })
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
    ipcClient?.app.addRecentDocument({ path: filePath })
    setProgress(LoadingStatus.CALC_HASH)
  }, [])

  return {
    importAnimeViaDragging,
    importAnimeViaIPC,
    video,
  }
}

// --- 历史记录保存 ---

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
    if (!animeId) {
      return db.history.add({
        ...historyData,
        progress: 0,
        duration: 0,
      })
    }

    const primaryKey = await db.history.add({
      ...historyData,
      progress: 0,
      duration: 0,
    })
    // 异步获取动漫封面和新番状态，不阻塞播放
    const updateBangumiData = async () => {
      const [bangumiDetail, bangumiShin] = await Promise.all([
        apiClient.bangumi.getBangumiDetailById(animeId),
        apiClient.bangumi.getBangumiShin(),
      ])

      Object.assign(historyData, {
        cover: bangumiDetail.bangumi.imageUrl,
        newBangumi: bangumiShin.bangumiList.some((item) => item.animeId === +animeId),
      })
      return db.history.update(primaryKey, historyData)
    }

    updateBangumiData()
    return
  }

  return db.history.update(existingAnime.hash, historyData)
}

// --- 从历史记录加载动漫 ---

export const useLoadingHistoricalAnime = () => {
  const clearPlayingVideo = useClearPlayingVideo()
  const setVideo = useSetAtom(videoAtom)
  const location = useLocation()
  const navigate = useNavigate()
  const setProgress = useSetAtom(loadingDanmuProgressAtom)
  const effectOnce = useRef(false)
  const { showFailedToast } = usePlayAnimeFailedToast()
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

    const animeData = await ipcClient?.player.getAnimeDetailByPath({ path: anime.path })
    if (!animeData?.ok) {
      showFailedToast({ title: '播放失败', description: animeData?.message || '未找到历史记录' })
      return
    }
    const { fileName, fileSize, fileHash } = animeData
    if (!fileHash || !fileName || !fileSize) {
      showFailedToast({ title: '播放失败', description: '未找到历史记录' })
      handleDeleteHistory(anime.hash)
      return
    }

    const playList = (await ipcClient?.player.getAnimeInSamePath({ path: anime.path })) ?? []
    setVideo({
      hash: fileHash,
      name: fileName,
      size: fileSize,
      url: anime.path,
      playList,
    })
    ipcClient?.app.addRecentDocument({ path: anime.path })
    setProgress(LoadingStatus.CALC_HASH)
  }, [hash])

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
