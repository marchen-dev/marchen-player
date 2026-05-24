import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { memo } from 'react'

import { isCompleted, isWatching, pickNextEpisode } from './selectors'

interface PosterCardProps {
  item: DB_Library
  onClick: () => void
}

export const PosterCard: FC<PosterCardProps> = memo(({ item, onClick }) => {
  const watched = item.watchedEpisodeIds.length
  const completed = isCompleted(item)
  const watching = isWatching(item)
  const percent = item.totalEpisodes > 0 ? Math.round((watched / item.totalEpisodes) * 100) : 0

  const nextEpNumber = watching ? pickNextEpisode(item)?.episodeNumber ?? null : null

  return (
    <article className="library-poster-card no-drag-region" onClick={onClick}>
      <div className="library-poster-art">
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.dataset.failed = '1'
            }}
          />
        )}

        {item.rating > 0 && (
          <span className="library-tl-badge library-tl-rating">
            <StarGlyph /> {item.rating.toFixed(1)}
          </span>
        )}
        {item.isOnAir && (
          <span className="library-tr-badge library-tr-onair">
            <span className="library-live-dot" />
            连载中
          </span>
        )}
        {completed && !item.isOnAir && (
          <span className="library-tr-badge library-tr-done">已看完</span>
        )}

        {watching && (
          <div className="library-poster-bottom">
            <div className="library-poster-bottom-bar">
              <div style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="library-poster-text">
        <p className="library-poster-title">{item.title}</p>
        <div className="library-poster-sub">
          <span className="library-tabular">
            {watched}/{item.totalEpisodes}
          </span>
          {watching && nextEpNumber != null && (
            <span className="library-next-badge">EP {String(nextEpNumber).padStart(2, '0')}</span>
          )}
        </div>
      </div>
    </article>
  )
})

PosterCard.displayName = 'PosterCard'

function StarGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

