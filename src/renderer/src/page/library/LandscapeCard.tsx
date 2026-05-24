import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { memo } from 'react'

import { pickNextEpisode } from './selectors'

/**
 * 16:9 横向卡，「继续观看」Rail 专用。
 *
 * 与 PosterCard 不同的地方：
 *  - 使用 backdrop 风格的横版封面铺底（这里仍然复用 imageUrl 竖封面，靠 object-fit:cover 裁切）
 *  - 底部叠加层显示「下一集 · 第 XX 话」+ 横贯进度条
 *  - 不参与 Manage 模式（Manage 模式下不渲染此 Rail）
 */
interface LandscapeCardProps {
  item: DB_Library
  /** 上次播放结束的关键帧（base64）；缺失时回退到 item.imageUrl */
  thumbnail?: string
  onClick: () => void
}

export const LandscapeCard: FC<LandscapeCardProps> = memo(({ item, thumbnail, onClick }) => {
  const watched = item.watchedEpisodeIds.length
  const percent = item.totalEpisodes > 0 ? Math.round((watched / item.totalEpisodes) * 100) : 0

  // 续看集号：pickNextEpisode 已限制在"已导入文件"范围；没下一集时显示上次看的那集
  const lastEp = item.episodes.find((ep) => ep.episodeId === item.lastWatchedEpisodeId)
  const nextEpNumber =
    pickNextEpisode(item)?.episodeNumber ?? lastEp?.episodeNumber ?? watched + 1

  return (
    <article className="library-lc-card no-drag-region" onClick={onClick}>
      <div className="library-lc-art">
        {(thumbnail || item.imageUrl) && (
          <img
            src={thumbnail || item.imageUrl}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.dataset.failed = '1'
            }}
          />
        )}
        <div className="library-lc-overlay">
          <span className="library-lc-meta">
            续看 · 第 {String(nextEpNumber).padStart(2, '0')} 话
          </span>
        </div>
        <button className="library-lc-play" type="button" tabIndex={-1} aria-label="播放">
          <PlayGlyph />
        </button>
        <div className="library-lc-progress">
          <div style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="library-lc-text">
        <div className="library-lc-title">{item.title}</div>
        <div className="library-lc-sub">
          <span className="library-tabular">
            {watched}/{item.totalEpisodes} 话
          </span>
          <span>·</span>
          <span>{percent}% 已观看</span>
        </div>
      </div>
    </article>
  )
})

LandscapeCard.displayName = 'LandscapeCard'

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
