import type { FC } from 'react'

/**
 * library 主区的空状态。两种文案：
 *  - 'empty'：库为空（用户刚装好软件 / 全部清空后）
 *  - 'no-match'：搜索 / 过滤无结果
 */
interface EmptyStateProps {
  variant?: 'empty' | 'no-match'
}

export const EmptyState: FC<EmptyStateProps> = ({ variant = 'empty' }) => {
  if (variant === 'no-match') {
    return (
      <div className="library-empty">
        <div className="library-empty-art">
          <SearchGlyph />
        </div>
        <p className="library-empty-title">没有匹配项</p>
        <p className="library-empty-sub">试试清除筛选或搜索条件</p>
      </div>
    )
  }

  return (
    <div className="library-empty">
      <div className="library-empty-art">
        <FilmGlyph />
      </div>
      <p className="library-empty-title">影视库为空</p>
      <p className="library-empty-sub">播放动画后会自动入库</p>
    </div>
  )
}

function FilmGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 9h18M3 15h18M8 4v16M16 4v16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
