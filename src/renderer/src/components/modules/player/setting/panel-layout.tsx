import type { PropsWithChildren } from 'react'
import { cn } from '@renderer/lib/utils'

/** 侧栏分组：组标题 + 内容。各标签页共用，保证组标题与组间距一致 */
export const PanelSection = ({
  title,
  className,
  children,
}: PropsWithChildren<{ title: string; className?: string }>) => (
  <section className={cn('space-y-3', className)}>
    <h3 className="text-sm font-semibold text-[var(--player-settings-fg)]">{title}</h3>
    {children}
  </section>
)

/** 圆角卡片，行与行之间画分隔线 */
export const PanelCard = ({ children }: PropsWithChildren) => (
  <div className="divide-y divide-white/11 rounded-xl bg-white/8 px-4">{children}</div>
)

/**
 * 卡片里的一行：给左右排布的设置行补上下留白。
 * 设置名用常规字重，与组标题（半粗）拉开层级，和播放页的开关行一致；
 * FieldLayout 自带 font-medium，这里只在侧栏卡片内覆盖，不改公共组件。
 */
export const PanelRow = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('py-3 text-sm [&>div>span:first-child]:font-normal', className)}>
    {children}
  </div>
)
