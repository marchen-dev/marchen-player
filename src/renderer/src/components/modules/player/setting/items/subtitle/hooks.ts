import { MARCHEN_PROTOCOL_PREFIX } from '@main/constants/protocol'
import { videoAtom } from '@renderer/atoms/player'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import NotoSansSC from '@renderer/styles/fonts/notoSansSC-medium.woff2?url'
import { useQuery } from '@tanstack/react-query'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import SubtitlesOctopus from 'libass-wasm'
import workerUrl from 'libass-wasm/dist/js/subtitles-octopus-worker.js?url'
import legacyWorkerUrl from 'libass-wasm/dist/js/subtitles-octopus-worker-legacy.js?url'
import { useCallback } from 'react'

import { usePlayerInstance, useSubtitleInstance } from '../../../Context'

const setIsLoadingEmbeddedSubtitleAtom = atom(false)

export const useSubtitle = () => {
  const { hash, url } = useAtomValue(videoAtom)
  const player = usePlayerInstance()
  const [subtitlesInstance, setSubtitlesInstance] = useSubtitleInstance()
  const setVideo = useSetAtom(videoAtom)
  const { toast } = useToast()
  const [isLoadingEmbeddedSubtitle, setIsLoadingEmbeddedSubtitle] = useAtom(
    setIsLoadingEmbeddedSubtitleAtom,
  )
  const { data, isFetching } = useQuery({
    queryKey: ['getAllSubtitlesFromAnime', url],
    queryFn: async () => {
      const subtitleDetails = await tipcClient?.getSubtitlesIntroFromAnime({ path: url })
      const anime = await db.history.get(hash)
      const defaultId =
        anime?.subtitles?.defaultId ??
        subtitleDetails?.find(
          (subtitle) => subtitle.tags.language === 'zho' || subtitle.tags.language === 'chi',
        )?.index ??
        subtitleDetails?.[0]?.index

      // 合并内嵌字幕列表和手动导入字幕列表
      const tags = [
        ...(subtitleDetails?.map((subtitle, index) => ({
          id: subtitle.index,
          index,
          title: subtitle.tags.title || `未知字幕 - ${index}`,
          language: subtitle.tags.language,
        })) ?? []),
        ...(anime?.subtitles?.tags.filter((tag) => tag.id < -1) ?? []),
      ]
      return {
        tags,
        defaultId: defaultId ?? -1,
      }
    },
    enabled: !!url,
  })
  const setSubtitlesOctopus = useCallback(
    async (path?: string) => {
      if (!player || !path) {
        return
      }
      const completePath = isWeb ? path : `${MARCHEN_PROTOCOL_PREFIX}${path}`
      const history = await db.history.get(hash)
      if (!subtitlesInstance) {
        setSubtitlesInstance(
          new SubtitlesOctopus({
            fonts: [NotoSansSC],
            video: player?.media as HTMLVideoElement,
            subUrl: completePath,
            timeOffset: history?.subtitles?.timeOffset ?? 0,
            workerUrl,
            legacyWorkerUrl,
          }),
        )
        return
      }
      subtitlesInstance?.freeTrack()
      subtitlesInstance?.setTrackByUrl(completePath)
    },
    [player?.media, setVideo, subtitlesInstance],
  )

  const fetchSubtitleBody = useCallback(
    async (params: FetchSubtitleBodyParams) => {
      try {
        const { id, path, fileName } = params

        // Web 端直接设置字幕路径, 不进行 indexdb 记录
        if (isWeb) {
          return setSubtitlesOctopus(path)
        }

        const oldHistory = await db.history.get(hash)

        // 手动导入字幕
        if (path || id === undefined) {
          let minimumId = oldHistory?.subtitles?.tags.slice().sort((tag1, tag2) => {
            return tag1.id - tag2.id
          })[0].id
          if (minimumId === undefined || minimumId >= -1) {
            minimumId = -1
          }
          const splitedFileName = fileName.split('.')
          const baseTitle = `外部字幕 - ${Math.abs(minimumId)}`

          // 通过文件名获取字幕标题 ex: 动漫名称.scjp.ass
          // scjp
          const title =
            splitedFileName.length >= 3 ? (splitedFileName.at(-2) ?? baseTitle) : baseTitle

          db.history.update(hash, {
            subtitles: {
              timeOffset: oldHistory?.subtitles?.timeOffset ?? 0,
              defaultId: minimumId - 1,
              tags: [...(oldHistory?.subtitles?.tags ?? []), { id: minimumId - 1, path, title }],
            },
          })
          return setSubtitlesOctopus(path)
        }

        const index = data?.tags?.findIndex((subtitle) => subtitle.id === id) ?? -1

        // 禁用字幕
        if (index === -1) {
          subtitlesInstance?.freeTrack()
          db.history.update(hash, {
            subtitles: {
              defaultId: id,
              tags: oldHistory?.subtitles?.tags ?? [],
            },
          })
          return
        }
        const existingSubtitle = (
          await db.history.where('hash').equals(hash).first()
        )?.subtitles?.tags.find((tag) => tag.id === id)

        // indexdb 已经存在字幕路径
        if (existingSubtitle) {
          db.history.update(hash, {
            subtitles: {
              timeOffset: oldHistory?.subtitles?.timeOffset ?? 0,
              defaultId: id,
              tags: oldHistory?.subtitles?.tags ?? [],
            },
          })
          return setSubtitlesOctopus(existingSubtitle.path)
        }

        setIsLoadingEmbeddedSubtitle(true)
        // 通过 ipc 获取被选中的动漫内嵌字幕
        const subtitleData = await tipcClient?.getSubtitlesBody({
          path: url,
          index,
        })
        const subtitlePath = subtitleData?.data
        if (!subtitlePath || !data?.tags?.[index]) {
          toast({
            title: '视频内嵌字幕加载失败',
          })
          throw new Error(subtitleData?.message ?? '字幕加载失败')
        }

        const newTags = [
          ...(oldHistory?.subtitles?.tags ?? []),
          {
            ...data.tags[index],
            path: subtitlePath,
          },
        ]

        db.history.update(hash, {
          subtitles: {
            defaultId: id,
            tags: newTags,
          },
        })
        await setSubtitlesOctopus(subtitlePath)
      } finally {
        setIsLoadingEmbeddedSubtitle(false)
      }
    },
    [data?.tags, url, hash, setSubtitlesOctopus, setIsLoadingEmbeddedSubtitle],
  )

  const initializeSubtitle = useCallback(async () => {
    try {
      // 优先使用默认字幕
      if (data?.defaultId !== undefined && data?.defaultId !== -1) {
        return await fetchSubtitleBody({ id: data.defaultId })
      }

      // 读取文件夹下的字幕文件
      const localSubtitles = await tipcClient?.matchSubtitleFile({ path: url })
      if (!localSubtitles || localSubtitles.length === 0) {
        return
      }

      const covertedSubtitle = await tipcClient?.coverSubtitleToAss({
        path: localSubtitles[0]?.filePath,
      })
      if (!covertedSubtitle) {
        return
      }
      const { fileName, filePath } = covertedSubtitle
      await fetchSubtitleBody({ path: filePath, fileName })
    } catch (error) {
      console.error(error)
    }
  }, [data, fetchSubtitleBody, url])

  return {
    subtitlesData: data,
    fetchSubtitleBody,
    setSubtitlesOctopus,
    initializeSubtitle,
    subtitlesInstance,
    isFetching,
    isLoadingEmbeddedSubtitle,
  }
}

type FetchSubtitleBodyParams = ParamsWithId | ParamsWithPath

type ParamsWithId = {
  id: number
  path?: undefined
  fileName?: undefined
}

type ParamsWithPath = {
  id?: undefined
  path: string
  fileName: string
}
