import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { memo } from 'react'

import { pickNextEpisode } from './selectors'

/**
 * 16:9 横向卡，「继续观看」Rail 专用。副标和进度条以 lastWatched 单集进度为准。
 */
interface LandscapeCardProps {
  item: DB_Library
  /** 上次播放结束的关键帧（base64）；缺失时回退到 item.imageUrl */
  thumbnail?: string
  /** lastWatched 集的单集进度（0~1），由父组件统一计算 */
  episodePct?: { episodeNumber: number, ratio: number }
  onClick: () => void
}

export const LandscapeCard: FC<LandscapeCardProps> = memo(
  ({ item, thumbnail, episodePct, onClick }) => {
    const lastEp = item.episodes.find((ep) => ep.episodeId === item.lastWatchedEpisodeId)
    const headerEpNumber =
      pickNextEpisode(item)?.episodeNumber ??
      lastEp?.episodeNumber ??
      item.watchedEpisodeIds.length + 1

    const pct = episodePct ? Math.round(episodePct.ratio * 100) : null
    const subEpNumber = episodePct?.episodeNumber ?? lastEp?.episodeNumber

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
              续看 · 第 {String(headerEpNumber).padStart(2, '0')} 话
            </span>
          </div>
          <button className="library-lc-play" type="button" tabIndex={-1} aria-label="播放">
            <PlayGlyph />
          </button>
          {pct != null && (
            <div className="library-lc-progress">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="library-lc-text">
          <div className="library-lc-title">{item.title}</div>
          <div className="library-lc-sub">
            {subEpNumber != null && pct != null ? (
              <>
                <span className="library-tabular">
                  第 {String(subEpNumber).padStart(2, '0')} 话
                </span>
                <span>·</span>
                <span>{pct}%</span>
              </>
            ) : (
              <span>即将开始</span>
            )}
          </div>
        </div>
      </article>
    )
  },
)

LandscapeCard.displayName = 'LandscapeCard'

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
