import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { memo } from 'react'

import { ctaLabel } from './selectors'

/**
 * 静态 Hero 主推区。
 *
 * featured 选择规则由上层 utils/shows.ts 的 `pickFeatured` 负责，本组件只负责渲染。
 * 字段缺失时的兜底（rating === 0 不渲染评分、空 tags 不渲染 tag 行等）在此处理。
 *
 * 设计稿原本有「自动轮播 + 分页 + dots」，本变更砍掉所有轮播相关元素，
 * Hero 始终展示单部作品。
 */
interface HeroProps {
  item: DB_Library
  /** 主 CTA「继续观看 / 开始观看」点击：跳转播放（在主入口 index.tsx 内实现） */
  onPlay: () => void
  /** 「详情」按钮点击：打开 DetailOverlay */
  onDetails: () => void
  /** 是否禁用主 CTA（如无可播放剧集），disabled 状态由上层判定后传入 */
  playDisabled?: boolean
  /** lastWatched 集的单集进度，由父层 progressMap 注入 */
  episodePct?: { episodeNumber: number, ratio: number }
}

export const Hero: FC<HeroProps> = memo(({ item, onPlay, onDetails, playDisabled, episodePct }) => {
  const yearLabel = item.airDate ? `${new Date(item.airDate).getFullYear()}` : ''
  const pct = episodePct ? Math.round(episodePct.ratio * 100) : null

  return (
    <section className="library-hero">
      <div className="library-hero-bg">
        {/* 优先渲染封面图 + 失败时 fallback 到 panel 占位（CSS 通过 [data-failed='1'] 处理） */}
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="eager"
            aria-hidden
            onError={(e) => {
              e.currentTarget.dataset.failed = '1'
            }}
          />
        ) : (
          <div className="library-hero-bg-fallback" />
        )}
      </div>

      <div className="library-hero-inner">
        <div className="library-hero-eyebrow">
          {item.isOnAir ? 'On Air · 连载中' : 'Continue Watching · 继续观看'}
        </div>

        <h1 className="library-hero-title">{item.title}</h1>

        <div className="library-hero-meta">
          {item.typeDescription && <span>{item.typeDescription}</span>}
          {item.totalEpisodes > 0 && <span>{item.totalEpisodes} 话</span>}
          {yearLabel && <span>{yearLabel}</span>}
          {item.rating > 0 && (
            <span className="library-hero-rating">
              <StarGlyph /> {item.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* tags 为空时不渲染 tag 行 */}
        {item.tags.length > 0 && (
          <div className="library-hero-tags">
            {item.tags.slice(0, 5).map((t) => (
              <span key={t} className="library-hero-tag">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* summary 为空时不渲染简介段落 */}
        {item.summary && <p className="library-hero-synopsis">{item.summary}</p>}

        <div className="library-hero-actions no-drag-region">
          <button
            type="button"
            className="library-btn-play"
            onClick={onPlay}
            disabled={playDisabled}
          >
            <PlayGlyph /> {ctaLabel(item)}
          </button>
          <button type="button" className="library-btn-ghost" onClick={onDetails}>
            <InfoGlyph />
            详情
          </button>
        </div>

        {/* 进度条以「上次看的那一集」单集进度为准，无 history 数据则隐藏 */}
        {episodePct && pct != null && (
          <div className="library-hero-progress">
            <div className="library-hero-progress-bar">
              <div className="library-hero-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="library-hero-progress-meta">
              <span>上次到 第 {String(episodePct.episodeNumber).padStart(2, '0')} 话</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
})

Hero.displayName = 'Hero'

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

function InfoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v.5M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
