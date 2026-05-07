import type { AIProviderConfig } from '@renderer/request/models/ai'
import type { FC } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { cn } from '@renderer/lib/utils'

interface ProviderCardProps {
  provider: AIProviderConfig
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
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
        'flex items-center gap-3 rounded-md border p-3 transition-colors',
        isActive && 'border-primary bg-primary/5',
      )}
    >
      {/* 激活 radio */}
      <button
        type="button"
        className="flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/50"
        onClick={onActivate}
      >
        {isActive && <span className="size-2 rounded-full bg-primary" />}
      </button>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{provider.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {provider.type}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {provider.model} · {provider.baseUrl}
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit}>
          <i className="icon-[mingcute--edit-line] text-sm" />
        </Button>
        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={handleDelete}>
          <i className="icon-[mingcute--delete-2-line] text-sm" />
        </Button>
      </div>
    </div>
  )
}
