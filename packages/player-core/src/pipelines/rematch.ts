/**
 * 播放中重新匹配 Pipeline
 *
 * 在 playing 状态下重新获取弹幕，不中断播放。
 * 使用 exhaustMap 防止重复点击。
 */

import type { Observable } from 'rxjs'
import type {
  DanmakuEntry,
  MatchedVideo,
  PipelineEvent,
  PlayerBridge,
  ServiceDeps,
  VideoInfo,
} from '../types'

import { concat, defer, of } from 'rxjs'
import { mergeDanmakuEntries } from '../state-machine'

/**
 * 创建重新匹配 pipeline
 *
 * 流程：reloading → fetch danmaku → update player → playing
 * 强制跳过缓存（因为 episodeId 可能变了）
 */
export function createRematchPipeline(
  match: MatchedVideo,
  video: VideoInfo,
  deps: ServiceDeps,
  playerBridge: PlayerBridge | null,
): Observable<PipelineEvent> {
  return concat(
    // 进入 reloading 状态
    of<PipelineEvent>({ type: 'reloading' }),

    // 获取新弹幕（强制刷新，不使用缓存）
    defer(async () => {
      const { hash } = video
      const chConvert = deps.settings.getChConvert()

      const commentsData = await deps.api.getDanmu(match.episodeId, {
        withRelated: true,
        chConvert,
      })

      // 保留已有的 local 弹幕
      const existingCache = await deps.cache.get(hash)
      const localDanmaku = existingCache?.filter((d) => d.type === 'local') ?? []

      const danmaku: DanmakuEntry[] = [
        { type: 'auto', source: 'dandanplay', content: commentsData, selected: true },
        ...localDanmaku,
      ]

      // 更新缓存
      await deps.cache.set(hash, danmaku)

      // 更新历史记录
      await deps.history.save({
        hash,
        path: video.url,
        episodeId: match.episodeId,
        animeTitle: match.animeTitle,
        episodeTitle: match.episodeTitle,
        animeId: match.animeId,
        danmaku,
      })

      const mergedComments = mergeDanmakuEntries(danmaku)

      // 通知播放器热更新弹幕
      playerBridge?.updateDanmaku(mergedComments)

      return { type: 'reloaded' as const, danmaku, mergedComments }
    }) as Observable<PipelineEvent>,
  )
}

/**
 * 添加本地弹幕（不改变状态机步骤，直接追加）
 *
 * 返回更新后的弹幕列表和合并后的评论
 */
export async function addLocalDanmakuEntry(
  newEntry: DanmakuEntry,
  currentDanmaku: DanmakuEntry[],
  video: VideoInfo,
  deps: ServiceDeps,
  playerBridge: PlayerBridge | null,
): Promise<{ danmaku: DanmakuEntry[]; mergedComments: import('../types').CommentModel[] }> {
  const updatedDanmaku = [...currentDanmaku, newEntry]

  // 更新缓存和历史
  await deps.cache.set(video.hash, updatedDanmaku)

  const mergedComments = mergeDanmakuEntries(updatedDanmaku)

  // 通知播放器热更新
  playerBridge?.updateDanmaku(mergedComments)

  return { danmaku: updatedDanmaku, mergedComments }
}
