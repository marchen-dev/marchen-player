import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { memo, useEffect } from 'react'

import { EpisodeGrid } from './EpisodeGrid'
import { ctaLabel, isWatching, pickNextEpisode } from './selectors'

/**
 * 全屏覆盖详情页（替代旧的侧拉 DetailSheet）。
 *
 * 结构：
 *  - scrim 蒙层：点击关闭
 *  - 主体（fixed inset:36px）：
 *      - 顶部 320px banner backdrop（用 imageUrl 模糊裁切）
 *      - 浮起 poster（220×330，上溢盖在 banner 下沿）
 *      - 右侧信息：标题/meta/tags/CTA/进度条/简介
 *      - 下方 EpisodeGrid
 *
 * 关闭方式：右上 ✕、点击 scrim、ESC。
 * 主 CTA 点击 onPlayNext，找出下一集；如无可播放剧集则按钮 disabled。
 *
 * 注意：本组件不接 ModalStackProvider，自管 keydown 即可（嵌套 ConfirmDialog
 * 时由 ConfirmDialog 的 stopPropagation 保证 ESC 优先关闭 Confirm）。
 */
interface DetailOverlayProps {
  item: DB_Library
  onClose: () => void
  /** 播放某一集（点 ep-tile 或主 CTA 都走这里） */
  onPlayEpisode: (episode: DB_LibraryEpisode) => void
}

export const DetailOverlay: FC<DetailOverlayProps> = memo(({ item, onClose, onPlayEpisode }) => {
  // ESC 关闭。仅在挂载期间监听。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const watched = item.watchedEpisodeIds.length
  const percent = item.totalEpisodes > 0 ? Math.round((watched / item.totalEpisodes) * 100) : 0
  const watching = isWatching(item)
  const yearLabel = item.airDate ? `${new Date(item.airDate).getFullYear()}` : ''

  // 下一集（用于主 CTA）：优先取未观看且有 fileHash 的；都没有则 disabled
  const nextEpisode = pickNextEpisode(item)
  const nextPlayable = nextEpisode && nextEpisode.fileHash ? nextEpisode : null

  // 没有下一集，但有第一集且 watched 全空：开始观看
  // 若整部作品都没有任何 fileHash → 主 CTA disabled
  const firstPlayable = item.episodes.find((ep) => !!ep.fileHash) ?? null
  // 真正会被播放的 episode：watching 时优先 next 未观看，否则 first
  const playableEpisode = nextPlayable ?? (watched === 0 ? firstPlayable : null)

  return (
    <>
      <div className="library-dt-scrim no-drag-region" onClick={onClose} />
      <div
        className="library-dt no-drag-region"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-dt-title"
      >
        <button
          type="button"
          className="library-dt-close"
          onClick={onClose}
          aria-label="关闭详情"
        >
          <CrossGlyph />
        </button>

        <div className="library-dt-banner">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              aria-hidden
              onError={(e) => {
                e.currentTarget.dataset.failed = '1'
              }}
            />
          )}
        </div>

        <div className="library-dt-body">
          <div className="library-dt-poster">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt={item.title}
                onError={(e) => {
                  e.currentTarget.dataset.failed = '1'
                }}
              />
            )}
          </div>

          <div className="library-dt-info">
            <h2 id="library-dt-title" className="library-dt-title">
              {item.title}
            </h2>

            <div className="library-dt-meta-row">
              {item.typeDescription && <span>{item.typeDescription}</span>}
              {item.totalEpisodes > 0 && <span>{item.totalEpisodes} 话</span>}
              {yearLabel && <span>{yearLabel}</span>}
              {item.rating > 0 && (
                <span className="library-hero-rating">
                  <StarGlyph /> {item.rating.toFixed(1)}
                </span>
              )}
            </div>

            {item.tags.length > 0 && (
              <div className="library-dt-tags">
                {item.tags.map((t) => (
                  <span key={t} className="library-dt-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="library-dt-actions">
              <button
                type="button"
                className="library-btn-play"
                disabled={!playableEpisode}
                onClick={() => playableEpisode && onPlayEpisode(playableEpisode)}
              >
                <PlayGlyph /> {ctaLabel(item)}
              </button>
            </div>

            {watching && (
              <div className="library-dt-progress">
                <div className="library-dt-progress-row">
                  <span>
                    第 {String(watched).padStart(2, '0')} /{' '}
                    {String(item.totalEpisodes).padStart(2, '0')} 话
                  </span>
                  <span className="library-dt-progress-val">{percent}%</span>
                </div>
                <div className="library-dt-progress-bar">
                  <div style={{ width: `${percent}%` }} />
                </div>
              </div>
            )}

            {item.summary && <p className="library-dt-summary">{item.summary}</p>}

            <div className="library-dt-section">
              <div className="library-dt-section-head">
                <h3>剧集</h3>
                <span className="library-muted">
                  {watched}/{item.totalEpisodes}
                </span>
              </div>
              <EpisodeGrid item={item} onPlay={onPlayEpisode} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
})

DetailOverlay.displayName = 'DetailOverlay'

function CrossGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function StarGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
