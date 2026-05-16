import type { FC } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { memo } from 'react'

interface FunctionAreaProps {
  selecting: boolean
  selectedCount: number
  totalCount: number
  onEnterSelect: () => void
  onCancelSelect: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDeleteSelected: () => void
  onClearAll: () => void
}

export const FunctionArea: FC<FunctionAreaProps> = memo(
  ({
    selecting,
    selectedCount,
    totalCount,
    onEnterSelect,
    onCancelSelect,
    onSelectAll,
    onDeselectAll,
    onDeleteSelected,
    onClearAll,
  }) => {
    const present = useConfirmationDialog()
    const allSelected = selectedCount === totalCount && totalCount > 0

    if (selecting) {
      return (
        <div className="no-drag-region flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            选中 {selectedCount}/{totalCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (allSelected) onDeselectAll()
              else onSelectAll()
            }}
          >
            {allSelected ? '取消全选' : '全选'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedCount === 0}
            onClick={() =>
              present({
                title: `确定删除选中的 ${selectedCount} 项？`,
                handleConfirm: onDeleteSelected,
              })
            }
          >
            删除
          </Button>
          <Button variant="outline" size="sm" onClick={onCancelSelect}>
            取消
          </Button>
        </div>
      )
    }

    return (
      <div className="no-drag-region flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEnterSelect}>
          管理
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() =>
            present({
              title: '确定清空影视库？',
              handleConfirm: () => onClearAll(),
            })
          }
        >
          全部删除
        </Button>
      </div>
    )
  },
)
