import type { SidebarRouteObject } from '@renderer/router'
import type { FC } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/Tooltip'
import { cn } from '@renderer/lib/utils'
import { siderbarRoutes } from '@renderer/router'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'

import { useSettingModal } from '../../modules/settings/hooks'

/**
 * Thin icon-only sidebar（72px 宽，纯黑白灰系统）。
 * 从 AppHeader 下方齐平开始，不再承担红绿灯让位与拖窗。
 */
export const Sidebar = () => {
  const showModal = useSettingModal()
  const { t } = useTranslation('app')

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="sidebar">
        <nav className="sidebar-nav no-drag-region select-none">
          {siderbarRoutes.map((route) => (
            <SidebarNavItem key={route.path} {...route} />
          ))}
        </nav>

        <div className="sidebar-bottom no-drag-region">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="sidebar-nav-item"
                onClick={() => showModal()}
                aria-label={t('sidebar.settings')}
              >
                <i className="icon-[mingcute--settings-3-line]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {t('sidebar.settings')}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}

/**
 * 单个导航项：icon-only NavLink + 右侧 hover Tooltip。
 * active 状态由 NavLink 的 `pathname === path` 判定（与原逻辑一致）。
 */
const SidebarNavItem: FC<SidebarRouteObject> = ({ path, meta }) => {
  const { pathname } = useLocation()
  const { t } = useTranslation('app')
  if (!meta || !path) return null

  const title = t(meta.titleKey)
  const { icon } = meta
  const isActive = pathname === path

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={path}
          draggable={false}
          // 直接用 path 作为 className 的判定输入，避免 NavLink 默认 `active` 类名与
          // 我们自定义的 `is-active` 命名冲突
          className={cn('sidebar-nav-item', isActive && 'is-active')}
          aria-label={title}
        >
          <i className={icon} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}
