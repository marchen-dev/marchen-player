import type { FC, PropsWithChildren } from 'react'

/**
 * Library 路由顶级容器。
 *
 * data-page="library" 提供 token scope；data-page-blend="hero" 让 AppHeader
 * 在本路由内透明 + blur，配合 hero 渲染 cinematic 渗入效果。
 */
export const LibraryShell: FC<PropsWithChildren> = ({ children }) => {
  return (
    <div data-page="library" data-page-blend="hero" className="library-shell">
      <main className="library-main">
        {children}
        <div className="library-bottom-spacer" />
      </main>
    </div>
  )
}
