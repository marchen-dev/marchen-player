import type { BangumiDetailResponseModel } from '@renderer/request/models/bangumi'
import type { DB_Library, DB_LibraryEpisode } from '../schemas/library'

import { apiClient } from '@renderer/request'

import { db } from '../db'

/**
 * 从 episodeTitle 中去掉 "第X话 " 前缀，只保留纯标题
 */
function parseEpisodeTitle(episodeTitle: string): string {
  return episodeTitle.replace(/^第\d+话\s*/, '')
}

/**
 * 判断 episodeNumber 是否为纯数字（正片）
 */
function isRegularEpisode(episodeNumber: string): boolean {
  return /^\d+$/.test(episodeNumber)
}

/**
 * 从 bangumi API 响应中提取 library 表需要的集数列表
 */
function extractEpisodes(
  bangumiEpisodes: BangumiDetailResponseModel['bangumi']['episodes'],
): DB_LibraryEpisode[] {
  return bangumiEpisodes
    .filter((ep) => isRegularEpisode(ep.episodeNumber))
    .map((ep) => ({
      episodeId: ep.episodeId,
      episodeNumber: Number(ep.episodeNumber),
      title: parseEpisodeTitle(ep.episodeTitle),
      airDate: ep.airDate,
    }))
}

/**
 * 将作品信息写入 library 表（幂等：已存在则更新，不存在则创建）
 */
export async function upsertLibraryEntry(
  bangumiDetail: BangumiDetailResponseModel,
  episodeId: number,
  fileHash: string,
): Promise<void> {
  const { bangumi } = bangumiDetail
  const { animeId } = bangumi

  const existing = await db.library.get(animeId)

  if (existing) {
    // 更新已有记录：只关联 fileHash，不标记已看
    // 关联 fileHash 到对应 episode
    const episodes = existing.episodes.map((ep) =>
      ep.episodeId === episodeId ? { ...ep, fileHash } : ep,
    )

    // 如果 episodes 为空（迁移产生的不完整记录），补全
    const finalEpisodes =
      episodes.length > 0 ? episodes : extractEpisodes(bangumi.episodes).map((ep) =>
        ep.episodeId === episodeId ? { ...ep, fileHash } : ep,
      )

    await db.library.update(animeId, {
      episodes: finalEpisodes,
      // 补全可能缺失的字段
      ...(existing.summary === '' && {
        summary: bangumi.summary || '',
        tags: bangumi.tags?.slice(0, 8).map((t) => t.name) || [],
        intro: bangumi.metadata?.join(' / ') || '',
        rating: bangumi.rating || 0,
        totalEpisodes: finalEpisodes.length,
        isOnAir: bangumi.isOnAir,
        type: bangumi.type,
        typeDescription: bangumi.typeDescription,
      }),
    })
  } else {
    // 创建新记录
    const episodes = extractEpisodes(bangumi.episodes).map((ep) =>
      ep.episodeId === episodeId ? { ...ep, fileHash } : ep,
    )

    const now = new Date().toISOString()

    const entry: DB_Library = {
      animeId,
      title: bangumi.animeTitle,
      imageUrl: bangumi.imageUrl,
      type: bangumi.type,
      typeDescription: bangumi.typeDescription,
      rating: bangumi.rating || 0,
      summary: bangumi.summary || '',
      totalEpisodes: episodes.length,
      airDate: episodes[0]?.airDate || '',
      isOnAir: bangumi.isOnAir,
      tags: bangumi.tags?.slice(0, 8).map((t) => t.name) || [],
      intro: bangumi.metadata?.join(' / ') || '',
      episodes,
      watchedEpisodeIds: [],
      lastWatchedAt: now,
      addedAt: now,
    }

    await db.library.add(entry)
  }
}

/**
 * 标记某集为已观看
 */
export async function markEpisodeWatched(
  animeId: number,
  episodeId: number,
): Promise<void> {
  const existing = await db.library.get(animeId)
  if (!existing) return

  if (existing.watchedEpisodeIds.includes(episodeId)) {
    // 已标记，只更新时间
    await db.library.update(animeId, {
      lastWatchedAt: new Date().toISOString(),
    })
  } else {
    await db.library.update(animeId, {
      watchedEpisodeIds: [...existing.watchedEpisodeIds, episodeId],
      lastWatchedEpisodeId: episodeId,
      lastWatchedAt: new Date().toISOString(),
    })
  }
}

/**
 * 重新匹配后更新 library 表的关联关系
 * 从旧作品中移除 fileHash，在新作品中添加
 */
export async function handleRematchLibraryUpdate(
  oldAnimeId: number | undefined,
  newAnimeId: number,
  newEpisodeId: number,
  fileHash: string,
): Promise<void> {
  try {
    // 从旧作品中移除 fileHash 关联
    if (oldAnimeId && oldAnimeId !== newAnimeId) {
      const oldEntry = await db.library.get(oldAnimeId)
      if (oldEntry) {
        const episodes = oldEntry.episodes.map((ep) =>
          ep.fileHash === fileHash ? { ...ep, fileHash: undefined } : ep,
        )
        await db.library.update(oldAnimeId, { episodes })
      }
    }

    // 在新作品中添加 fileHash 关联
    const newEntry = await db.library.get(newAnimeId)
    if (newEntry) {
      const episodes = newEntry.episodes.map((ep) =>
        ep.episodeId === newEpisodeId ? { ...ep, fileHash } : ep,
      )

      await db.library.update(newAnimeId, {
        episodes,
      })
    } else {
      // 新作品不存在于 library 中，获取详情并创建
      const bangumiDetail = await apiClient.bangumi.getBangumiDetailById(newAnimeId)
      await upsertLibraryEntry(bangumiDetail, newEpisodeId, fileHash)
    }
  } catch (error) {
    console.error('重新匹配后更新 library 失败:', error)
  }
}
