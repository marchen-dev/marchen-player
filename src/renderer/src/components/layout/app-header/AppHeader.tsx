import { pageHeaderAtom } from '@renderer/atoms/page-header'
import { cn, isMac } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'

/**
 * 全宽 app 顶部 header。
 *
 * 三槽布局：左侧 macOS 红绿灯让位 / 中间页面标题 / 右侧页面 actions。
 * 内容由 page 通过 usePageHeader 注入；player/history 等不注入时仅显示空骨架。
 */
export const AppHeader = () => {
  const { title, actions, variant = 'default' } = useAtomValue(pageHeaderAtom)

  return (
    <header
      className={cn('app-header drag-region', isMac && 'is-mac', variant === 'manage' && 'is-manage')}
    >
      {isMac && <div className="app-header-tl-spacer" aria-hidden />}

      <div className="app-header-title no-drag-region">{title}</div>

      <div className="app-header-actions no-drag-region">{actions}</div>
    </header>
  )
}
