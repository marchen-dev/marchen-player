import type { FC } from 'react'
import { useEffect } from 'react'

/**
 * library 自管的确认对话框。
 *
 * 设计取舍：不接入 shadcn AlertDialog / 项目 ModalStackProvider——
 *  - 设计稿要求自定义动画（pop-in cubic-bezier）与玻璃感样式；
 *  - z-index 直接走 library.css 内的 `calc(var(--z-dialog) + 1)`，
 *    保证在 DetailOverlay (--z-dialog) 之上、Toast (--z-toast) 之下。
 *
 * 行为：Enter 触发 confirm；ESC / 点击 scrim / 点击「取消」均触发 close。
 */
interface ConfirmDialogProps {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
  title,
  body,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger,
  onConfirm,
  onClose,
}) => {
  // 全局键盘快捷键：Enter 提交、ESC 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        onConfirm()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onClose])

  return (
    <>
      <div className="library-confirm-scrim no-drag-region" onClick={onClose} />
      <div
        className="library-confirm-dialog no-drag-region"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="library-confirm-title"
      >
        <h3 id="library-confirm-title" className="library-confirm-title">
          {title}
        </h3>
        {body && <p className="library-confirm-body">{body}</p>}
        <div className="library-confirm-actions">
          <button type="button" className="library-confirm-btn library-confirm-cancel" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`library-confirm-btn ${danger ? 'library-confirm-danger' : 'library-confirm-primary'}`}
            // autoFocus 让 Enter 提交体验更自然
            autoFocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
