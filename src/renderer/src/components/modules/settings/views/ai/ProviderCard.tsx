import type { AIProviderConfig } from '@renderer/request/models/ai'
import type { FC } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { cn } from '@renderer/lib/utils'

interface ProviderCardProps {
  provider: AIProviderConfig
  isActive: boolean
  onActivate: () => void
  onEdit: (trigger: HTMLButtonElement) => void
  onDelete: () => void
}

export const ProviderCard: FC<ProviderCardProps> = ({
  provider,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}) => {
  const present = useConfirmationDialog()

  const handleDelete = () => {
    present({
      title: `确定删除「${provider.name}」？`,
      handleConfirm: onDelete,
    })
  }

  return (
    <div
      className={cn(
        'app-settings-provider-row flex min-w-0 items-center gap-3 px-4 py-3 transition-colors',
        isActive && 'is-active',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={isActive}
        aria-label={`设为当前服务商：${provider.name}`}
        className="app-settings-provider-radio"
        onClick={onActivate}
      >
        {isActive && <span className="size-2 rounded-full bg-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={provider.name}>
            {provider.name}
          </span>
          <span className="shrink-0 rounded bg-[var(--settings-selected)] px-1.5 py-0.5 text-xs text-[var(--settings-muted)]">
            {provider.type}
          </span>
          {isActive && (
            <span className="shrink-0 text-xs font-medium text-[var(--settings-focus)]">当前</span>
          )}
        </div>
        <p
          className="truncate text-xs text-[var(--settings-muted)]"
          title={`${provider.model} · ${provider.baseUrl}`}
        >
          {provider.model} · {provider.baseUrl}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          aria-label={`编辑服务商：${provider.name}`}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          <i className="icon-[mingcute--edit-line] text-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive size-8 p-0"
          aria-label={`删除服务商：${provider.name}`}
          onClick={handleDelete}
        >
          <i className="icon-[mingcute--delete-2-line] text-sm" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
