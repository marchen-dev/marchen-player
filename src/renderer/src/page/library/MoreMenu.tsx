import type { FC } from 'react'

/**
 * 更多操作菜单。本变更仅暴露两项：
 *  - 管理 / 批量删除（进入 Manage 模式）
 *  - 全部清空…（危险样式，确认后清空 library 表）
 *
 * 设计稿中的「导入文件夹 / 刷新封面元数据」均不实现（见 design.md 决策）。
 */
interface MoreMenuProps {
  onManage: () => void
  onClearAll: () => void
}

export const MoreMenu: FC<MoreMenuProps> = ({ onManage, onClearAll }) => {
  return (
    <div className="library-menu-popover" role="menu">
      <button type="button" className="library-menu-item" onClick={onManage}>
        <span className="library-menu-icon">
          <SelectGlyph />
        </span>
        <span className="library-menu-label">管理 / 批量删除</span>
        <span className="library-menu-hint" />
      </button>
      <div className="library-menu-divider" />
      <button type="button" className="library-menu-item is-danger" onClick={onClearAll}>
        <span className="library-menu-icon">
          <TrashGlyph />
        </span>
        <span className="library-menu-label">全部清空…</span>
        <span className="library-menu-hint" />
      </button>
    </div>
  )
}

function SelectGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M16 16l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
