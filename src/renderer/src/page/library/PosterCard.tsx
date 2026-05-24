import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { cn } from '@renderer/lib/utils'
import { memo } from 'react'

import { isCompleted, isWatching } from './utils/shows'

/**
 * 2:3 比例的标准海报卡，用在「所有作品」Rail 中。
 *
 * 渲染分支：
 *  - normal 模式：显示评分、On Air / 已看完徽标、hover 浮起播放按钮、底部进度条
 *  - manage 模式：隐藏所有徽标，左上角显示 pick 圆点；选中时显示 outline 与勾选图标
 */
interface PosterCardProps {
  item: DB_Library
  /** 是否处于 Manage 模式 */
  managing?: boolean
  /** Manage 模式下当前是否选中 */
  selected?: boolean
  /** 点击卡片：normal 下打开详情，manage 下切换选中（由上层 dispatch） */
  onClick: () => void
}

export const PosterCard: FC<PosterCardProps> = memo(({ item, managing, selected, onClick }) => {
  const watched = item.watchedEpisodeIds.length
  const completed = isCompleted(item)
  const watching = isWatching(item)
  const percent = item.totalEpisodes > 0 ? Math.round((watched / item.totalEpisodes) * 100) : 0

  // 下一集集号，watching 时用于显示 EP NN 小徽标
  const nextEpNumber = watching
    ? // 找出第一个未观看的 episodeNumber；若没有 episodes 数据则退回 watched+1
      [...item.episodes]
        .sort((a, b) => a.episodeNumber - b.episodeNumber)
        .find((ep) => !item.watchedEpisodeIds.includes(ep.episodeId))?.episodeNumber ??
      watched + 1
    : null

  return (
    <article
      className={cn(
        'library-poster-card no-drag-region',
        managing && 'is-managing',
        managing && selected && 'is-selected',
      )}
      onClick={onClick}
    >
      <div className="library-poster-art">
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            // 失败时打标记，CSS 上 [data-failed='1'] 隐藏图片，露出 panel 占位
            onError={(e) => {
              e.currentTarget.dataset.failed = '1'
            }}
          />
        )}

        {/* normal 模式：评分 / 状态徽标 / hover 播放按钮 */}
        {!managing && item.rating > 0 && (
          <span className="library-tl-badge library-tl-rating">
            <StarGlyph /> {item.rating.toFixed(1)}
          </span>
        )}
        {!managing && item.isOnAir && (
          <span className="library-tr-badge library-tr-onair">
            <span className="library-live-dot" />
            连载中
          </span>
        )}
        {!managing && completed && !item.isOnAir && (
          <span className="library-tr-badge library-tr-done">已看完</span>
        )}

        {!managing && (
          <div className="library-poster-hover">
            <button className="library-poster-play" type="button" tabIndex={-1}>
              <PlayGlyph />
            </button>
          </div>
        )}

        {/* manage 模式：左上 pick 圆点 */}
        {managing && (
          <span className={cn('library-pick', selected && 'is-on')}>
            {selected && <CheckGlyph />}
          </span>
        )}

        {/* 底部进度条：normal 模式 + 在看时显示 */}
        {!managing && watching && (
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
          {!managing && watching && nextEpNumber != null && (
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

function PlayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
