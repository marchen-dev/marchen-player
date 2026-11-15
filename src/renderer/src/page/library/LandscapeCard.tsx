import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import type { LibraryCardActions } from './LibraryCardContextMenu'
import type { LibrarySource } from './selectors'
import { CONTENT_LANG } from '@renderer/lib/i18n'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { LibraryCardContextMenu } from './LibraryCardContextMenu'
import { pickNextEpisode } from './selectors'
import { SourceTag } from './SourceTag'

/**
 * 16:9 横向卡，「继续观看」Rail 专用。副标和进度条以 lastWatched 单集进度为准。
 */
interface LandscapeCardProps {
  item: DB_Library
  /** 上次播放结束的关键帧（base64）；缺失时回退到 item.imageUrl */
  thumbnail?: string
  /** lastWatched 集的单集进度（0~1），由父组件统一计算 */
  episodePct?: { episodeNumber: number; ratio: number }
  onClick: () => void
  actions: LibraryCardActions
  /** 已导入剧集的媒体来源 */
  source?: LibrarySource
}

export const LandscapeCard: FC<LandscapeCardProps> = memo(
  ({ item, thumbnail, episodePct, onClick, actions, source }) => {
    const { t } = useTranslation('library')
    const lastEp = item.episodes.find((ep) => ep.episodeId === item.lastWatchedEpisodeId)
    const headerEpNumber =
      pickNextEpisode(item)?.episodeNumber ??
      lastEp?.episodeNumber ??
      item.watchedEpisodeIds.length + 1

    const pct = episodePct ? Math.round(episodePct.ratio * 100) : null
    const subEpNumber = episodePct?.episodeNumber ?? lastEp?.episodeNumber

    return (
      <LibraryCardContextMenu item={item} actions={actions} source={source}>
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
                {t('card.resume', { episode: String(headerEpNumber).padStart(2, '0') })}
              </span>
            </div>
            <button
              className="library-lc-play"
              type="button"
              tabIndex={-1}
              aria-label={t('card.play')}
            >
              <PlayGlyph />
            </button>
            {pct != null && (
              <div className="library-lc-progress">
                <div style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <div className="library-lc-text">
            <div className="library-lc-title" lang={CONTENT_LANG}>
              {item.title}
            </div>
            <div className="library-lc-sub">
              {subEpNumber != null && pct != null ? (
                <>
                  <span className="library-tabular">
                    {t('card.episode', { episode: String(subEpNumber).padStart(2, '0') })}
                  </span>
                  <span>·</span>
                  <span>{pct}%</span>
                </>
              ) : (
                <span>{t('card.upcoming')}</span>
              )}
              {source && (
                <>
                  <span>·</span>
                  <SourceTag source={source} />
                </>
              )}
            </div>
          </div>
        </article>
      </LibraryCardContextMenu>
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
