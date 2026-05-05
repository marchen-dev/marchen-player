/**
 * 主加载 Pipeline
 *
 * 编排完整的加载流程：import → hash → match → [wait user] → danmaku → ready → playing
 * 使用 RxJS concat 保证步骤顺序执行，通过 event$ 输出状态转换事件。
 */

import type { Observable } from 'rxjs'
import type {
  Command,
  DanmakuEntry,
  MatchedVideo,
  PipelineEvent,
  ServiceDeps,
  VideoInfo,
} from '../types'
import { concat, defer, EMPTY, from, of } from 'rxjs'

import { delay, filter, map, take } from 'rxjs/operators'
import { mergeDanmakuEntries } from '../state-machine'

/**
 * 创建主加载 pipeline
 *
 * @param source 加载来源（file 或 path）
 * @param deps 注入的依赖
 * @param command$ 命令流（用于等待用户选择）
 * @returns Observable<PipelineEvent> 状态转换事件流
 */
export function createLoadPipeline(
  source: { type: 'file'; file: File } | { type: 'path'; path: string },
  deps: ServiceDeps,
  command$: Observable<Command>,
): Observable<PipelineEvent> {
  return concat(
    // Step 1: 开始导入
    of<PipelineEvent>({ type: 'started' }),

    // Step 2: 导入视频获取基本信息
    defer(() => {
      const importPromise =
        source.type === 'file'
          ? deps.importer.importFromFile(source.file)
          : deps.importer.importFromPath(source.path)

      return from(importPromise).pipe(
        map((video): PipelineEvent => ({ type: 'hashed', video })),
      )
    }),

    // Step 3-5: 匹配 → 可能等待用户 → 加载弹幕 → 播放
    // 使用 defer 确保在前面步骤完成后才执行（需要 video 数据）
    defer(() => createMatchAndLoadSegment(deps, command$)),
  )
}

/**
 * 匹配 + 加载弹幕段（占位）
 * 实际的匹配和加载逻辑在 service.ts 的 executeFullLoad 中编排，
 * 因为需要访问 service 的 currentState 和 command$。
 */
function createMatchAndLoadSegment(
  _deps: ServiceDeps,
  _command$: Observable<Command>,
): Observable<PipelineEvent> {
  return EMPTY
}

/**
 * 执行匹配逻辑
 * 先检查本地历史缓存，再调 API
 */
export function executeMatch(
  video: VideoInfo,
  deps: ServiceDeps,
): Observable<PipelineEvent> {
  return defer(async () => {
    // 先查本地历史记录是否已有匹配
    const history = await deps.history.get(video.hash)
    if (history?.episodeId && history?.animeId) {
      return {
        type: 'matched' as const,
        match: {
          episodeId: history.episodeId,
          animeTitle: history.animeTitle || '',
          episodeTitle: history.episodeTitle || '',
          animeId: history.animeId,
        },
      }
    }

    // 调 API 匹配
    const result = await deps.api.match({
      hash: video.hash,
      size: video.size,
      name: video.name,
    })

    // 精准匹配
    if (result.isMatched && result.matches[0]) {
      const m = result.matches[0]
      return {
        type: 'matched' as const,
        match: {
          episodeId: m.episodeId,
          animeTitle: m.animeTitle || '',
          episodeTitle: m.episodeTitle || '',
          animeId: m.animeId,
        },
      }
    }

    // 未精准匹配，需要用户选择
    return {
      type: 'waitingUser' as const,
      matchData: result,
      video,
    }
  }) as Observable<PipelineEvent>
}

/**
 * 执行弹幕加载逻辑
 * 优先使用缓存，新番或无缓存时重新请求
 */
export function executeFetchDanmaku(
  match: MatchedVideo,
  video: VideoInfo,
  deps: ServiceDeps,
  forceRefresh = false,
): Observable<PipelineEvent> {
  return defer(async () => {
    const { hash } = video

    // 检查缓存
    if (!forceRefresh) {
      const cached = await deps.cache.get(hash)
      const isStale = await deps.cache.isStale(hash)
      if (cached && !isStale) {
        const mergedComments = mergeDanmakuEntries(cached)
        return { type: 'danmakuLoaded' as const, danmaku: cached, mergedComments }
      }
    }

    // 请求新弹幕
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

    // 写入缓存
    await deps.cache.set(hash, danmaku)

    const mergedComments = mergeDanmakuEntries(danmaku)
    return { type: 'danmakuLoaded' as const, danmaku, mergedComments }
  }) as Observable<PipelineEvent>
}

/**
 * 等待用户选择（selectMatch 或 skipDanmaku）
 * pipeline 在此处"挂起"，直到收到用户命令
 */
export function waitForUserSelection(
  command$: Observable<Command>,
): Observable<Command> {
  return command$.pipe(
    filter((cmd) => cmd.type === 'selectMatch' || cmd.type === 'skipDanmaku'),
    take(1),
  )
}

/**
 * 完成加载：保存历史 → ready → playing
 */
export function executeFinish(
  video: VideoInfo,
  match: MatchedVideo,
  danmaku: DanmakuEntry[],
  deps: ServiceDeps,
): Observable<PipelineEvent> {
  return concat(
    // 保存到历史记录
    defer(async () => {
      await deps.history.save({
        hash: video.hash,
        path: video.url,
        episodeId: match.episodeId,
        animeTitle: match.animeTitle,
        episodeTitle: match.episodeTitle,
        animeId: match.animeId,
        danmaku,
      })
      return { type: 'ready' as const }
    }) as Observable<PipelineEvent>,

    // 短暂延迟后进入播放状态（给 UI 展示 ready 状态的时间）
    of<PipelineEvent>({ type: 'playing' }).pipe(delay(100)),
  )
}
