import type { FC, PropsWithChildren, ReactNode } from 'react'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { cn } from '@renderer/lib/utils'

interface SettingsPageProps extends PropsWithChildren {
  title: string
  description: string
  action?: ReactNode
  sectionId: string
}

export const SettingsPage: FC<SettingsPageProps> = ({
  title,
  description,
  action,
  sectionId,
  children,
}) => (
  <div className="app-settings-page" data-settings-section={sectionId}>
    <SettingsPageHeader title={title} description={description} action={action} />
    <ScrollArea className="min-h-0" classNames={{ viewport: 'app-settings-scroll-viewport' }}>
      <div className="app-settings-page-body">{children}</div>
    </ScrollArea>
  </div>
)

export const SettingsPageHeader: FC<{
  title: string
  description: string
  action?: ReactNode
}> = ({ title, description, action }) => (
  <header className="app-settings-page-header">
    <div className="min-w-0">
      <h2 className="app-settings-page-title">{title}</h2>
      <p className="app-settings-page-description">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
)

export const SettingsSection: FC<
  PropsWithChildren & { title: string; description?: string; className?: string }
> = ({ title, description, className, children }) => (
  <section className={cn('app-settings-section', className)}>
    <div className="app-settings-section-heading">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
    {children}
  </section>
)

export const SettingsGroup: FC<PropsWithChildren & { className?: string }> = ({
  children,
  className,
}) => <div className={cn('app-settings-group', className)}>{children}</div>

interface SettingsRowProps extends PropsWithChildren {
  label: ReactNode
  description?: ReactNode
  labelId?: string
  descriptionId?: string
  className?: string
}

export const SettingsRow: FC<SettingsRowProps> = ({
  label,
  description,
  labelId,
  descriptionId,
  className,
  children,
}) => (
  <div className={cn('app-settings-row', className)}>
    <div className="min-w-0 pr-6">
      <div id={labelId} className="app-settings-row-label">
        {label}
      </div>
      {description && (
        <div id={descriptionId} className="app-settings-row-description">
          {description}
        </div>
      )}
    </div>
    <div className="app-settings-row-control">{children}</div>
  </div>
)

export const SettingsActionRow: FC<
  PropsWithChildren & { label: ReactNode; description?: ReactNode; danger?: boolean }
> = ({ label, description, danger, children }) => (
  <div className={cn('app-settings-action-row', danger && 'is-danger')}>
    <div className="min-w-0 pr-6">
      <div className="app-settings-row-label">{label}</div>
      {description && <div className="app-settings-row-description">{description}</div>}
    </div>
    <div className="app-settings-row-control">{children}</div>
  </div>
)
