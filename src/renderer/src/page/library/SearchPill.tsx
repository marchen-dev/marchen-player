import type { FC } from 'react'

/**
 * TopBar 内的搜索 pill。
 *
 * 行为：
 *  - 输入实时上抛 onChange
 *  - 非空时把右侧的 ⌘K 提示替换为 ✕ 清除按钮，点击清空
 *  - focus 时通过 CSS 展开宽度（在 library.css 中实现）
 */
interface SearchPillProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

export const SearchPill: FC<SearchPillProps> = ({
  value,
  onChange,
  placeholder = '搜索作品 / 标签',
}) => {
  return (
    <label className="library-search-pill no-drag-region">
      <SearchGlyph />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ color: 'var(--library-fg-3)', background: 'transparent', border: 0 }}
          aria-label="清除搜索"
        >
          ✕
        </button>
      ) : (
        // ⌘K 是 macOS 习惯，Windows 上简单显示同样符号即可（项目其他位置也是这样）
        <kbd>⌘K</kbd>
      )}
    </label>
  )
}

function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
