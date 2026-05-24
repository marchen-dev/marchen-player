import type { FC, PropsWithChildren, ReactNode } from 'react'

/**
 * Library 路由专用顶级容器。
 *
 * 设计取舍：
 * - 不使用全局 `RouterLayout`：RouterLayout 强制了一个固定顶部标题区与 `pt-7` 内边距，
 *   会让设计稿要求的「TopBar sticky 透明渐变 + Hero 向上溢出到 TopBar 下方」无法实现。
 *   `RouterLayout` 仍被 `/latest-anime` 占位页使用，所以保留不删。
 * - 挂载 `data-page="library"` 属性，使 `src/renderer/src/styles/library.css` 中
 *   作用域到 `[data-page="library"]` 与 `.dark [data-page="library"]` 的 token / 组件
 *   样式生效；token 不污染全局 shadcn 体系。
 *
 * 该组件不做交互逻辑，仅负责布局骨架：顶部 TopBar 区域 + 主滚动区。
 * 子组件由 `index.tsx` 组装并传入。
 */
interface LibraryShellProps extends PropsWithChildren {
  /** 顶部 TopBar 区，sticky 在主区顶部 */
  topBar: ReactNode
}

export const LibraryShell: FC<LibraryShellProps> = ({ topBar, children }) => {
  return (
    <div data-page="library" className="library-shell">
      <main className="library-main">
        {/* TopBar 内部已自带 sticky 定位 */}
        {topBar}
        {children}
        <div className="library-bottom-spacer" />
      </main>
    </div>
  )
}
