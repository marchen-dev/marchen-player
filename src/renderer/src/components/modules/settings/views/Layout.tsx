import type { FC, PropsWithChildren, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export const SettingViewContainer: FC<PropsWithChildren> = ({ children }) => {
  return <div className="space-y-4 p-5">{children}</div>
}

interface FieldsCardLayoutProps extends PropsWithChildren {
  title?: ReactNode
  className?: string
}
export const FieldsCardLayout: FC<FieldsCardLayoutProps> = ({ children, title, className }) => {
  return (
    <section className={cn('bg-card min-h-20 space-y-4 rounded-lg border p-3', className)}>
      <p className="text-muted-foreground mb-1 text-sm font-semibold">{title}</p>
      {children}
    </section>
  )
}

interface FieldLayoutProps extends PropsWithChildren {
  title?: ReactNode
  className?: string
}

export const FieldLayout = ({
  ref,
  children,
  title,
  className,
}: FieldLayoutProps & { ref?: React.RefObject<HTMLDivElement> }) => {
  return (
    <div className={cn('flex items-center justify-between', className)} ref={ref}>
      <span className="font-medium">{title}</span>
      {children}
    </div>
  )
}
