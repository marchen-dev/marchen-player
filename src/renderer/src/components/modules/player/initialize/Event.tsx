import { useClearPlayingVideo, videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { db } from '@renderer/database/db'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import { Events } from '@suemor/xgplayer'
import { useAtomValue } from 'jotai'
import { throttle } from 'lodash-es'
import { useCallback, useEffect, useRef } from 'react'

import { usePlayerInstance } from '../Context'
import { useVideo } from '../loading/hooks'
import type { PlayerType } from './hooks'

export const InitializeEvent = () => {
  const player = usePlayerInstance()
  const { grabFrame, initializePlayerListener, initializePlayerEvent } = usePlayerInitialize(player)

  useEffect(() => {
    if (!player) {
      return
    }

    initializePlayerEvent()

    const listenerClear = initializePlayerListener()

    return () => {
      grabFrame()
      if (listenerClear) {
        listenerClear()
      }
    }
  }, [initializePlayerEvent])
  return null
}

const usePlayerInitialize = (player: PlayerType | null | undefined) => {
  const clickTimeout = useRef<number | null>(null)
  const { hash } = useAtomValue(videoAtom)
  const { importAnimeViaIPC } = useVideo()
  const resetVideo = useClearPlayingVideo()
  const { enableAutomaticEpisodeSwitching } = usePlayerSettingsValue()
  // 需要对 xgplayer 自带的全屏事件进行重写，以适配 electron 的全屏
  const initializePlayerListener = useCallback(() => {
    if (isWeb) {
      return
    }
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const isFull = await tipcClient?.getWindowIsFullScreen()
        if (!isFull) {
          player?.exitCssFullscreen()
        }
        tipcClient?.windowAction({ action: 'leave-full-screen' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    const videoElement = player?.media as HTMLVideoElement

    const handleDoubleClick = () => {
      if (clickTimeout.current !== null) {
        window.clearTimeout(clickTimeout.current)
        clickTimeout.current = null
      }
      tipcClient?.windowAction({ action: 'switch-full-screen' })
    }

    const handleSingleClick = () => {
      if (clickTimeout.current !== null) {
        window.clearTimeout(clickTimeout.current)
      }

      clickTimeout.current = window.setTimeout(() => {
        if (videoElement?.paused) {
          videoElement.play()
        } else {
          videoElement.pause()
        }
        clickTimeout.current = null
      }, 200) // 使用较短的延迟以区分单击和双击
    }
    if (videoElement) {
      videoElement.addEventListener('dblclick', handleDoubleClick)
      videoElement.addEventListener('click', handleSingleClick)
    }

    // 清理函数
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (videoElement) {
        videoElement.removeEventListener('dblclick', handleDoubleClick)
        videoElement.removeEventListener('click', handleSingleClick)
      }
    }
  }, [player])

  const initializePlayerEvent = useCallback(async () => {
    if (!player) {
      return
    }

    // 进入窗口全屏
    player.getCssFullscreen()

    // 保存视频进度
    player?.on(
      Events.TIME_UPDATE,
      throttle((data) => {
        if (!hash) {
          return
        }
        db.history.update(hash, {
          progress: data?.currentTime,
          duration: data?.duration,
        })
      }, 2000),
    )

    // 视频加载完成后，截取缩略图
    player.on(Events.LOADED_METADATA, (data) => {
      if (!isWeb) {
        const { duration } = data
        grabFrame((duration / 2).toString())
      }
      db.history.update(hash, {
        duration: data?.duration,
      })
    })

    // 视频播放结束, 更新播放进度并请求下一集
    player.on(Events.ENDED, async () => {
      if (!hash) {
        return
      }
      const latestAnime = await db.history.get(hash)
      await db.history.update(hash, {
        progress: latestAnime?.duration,
      })
      if (!enableAutomaticEpisodeSwitching || isWeb) {
        return
      }
      const urlList = player.config.nextEpisode.urlList as string[]
      const nextAnimeUrl = urlList?.indexOf(player.config.url as string)
      if (nextAnimeUrl === urlList.length - 1) {
        return
      }
      player.emit(Events.PLAYNEXT, urlList[nextAnimeUrl + 1] ?? urlList[0])
    })

    player.on(Events.PLAYNEXT, async (url: string) => {
      const path = await tipcClient?.getFilePathFromProtocolURL({ path: url })
      if (!path) {
        return
      }
      importAnimeViaIPC({ path })
    })
    // 点击左上角关闭按钮
    player.on('exit', async () => {
      const isFull = await tipcClient?.getWindowIsFullScreen()
      isFull && tipcClient?.windowAction({ action: 'leave-full-screen' })
      resetVideo()
      // 如果是 css 全屏，需要延迟销毁，否则会导致退出动画无法正常播放
      // 全屏模式不执行动画，否者会卡顿
      if (player.cssfullscreen && !isFull) {
        return setTimeout(() => {
          player.destroy()
        }, 300)
      }
      return player.destroy()
    })
  }, [hash, player])

  const grabFrame = useCallback(
    async (time?: string) => {
      if (!isWeb) {
        const latestAnime = await db.history.get(hash)
        const isEnd = latestAnime?.progress === latestAnime?.duration
        if (!latestAnime) {
          return
        }
        // 如果没有传入时间，则默认截取当前播放时间
        let grabTime = time
        if (!grabTime) {
          // 如果是播放结束，则截取倒数第三秒
          grabTime = isEnd
            ? ((latestAnime?.progress ?? 3) - 3).toString()
            : latestAnime?.progress.toString() || '0'
        }
        const base64Image = await tipcClient?.grabFrame({
          path: latestAnime?.path,
          time: grabTime,
        })
        await db.history.update(hash, {
          thumbnail: base64Image,
        })
      }
    },
    [hash],
  )

  return {
    initializePlayerListener,
    initializePlayerEvent,
    grabFrame,
  }
}
