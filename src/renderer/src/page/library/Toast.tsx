import type { FC } from 'react'

/**
 * library 自管的 Toast，仅作为信息反馈。
 * z-index 通过 library.css 走 `var(--z-toast)`，永远最上层。
 *
 * 显示时机由上层控制：上层用 setTimeout 在 2.4s 后清空 toast state 即可。
 */
interface ToastProps {
  text: string
}

export const Toast: FC<ToastProps> = ({ text }) => {
  return (
    <div className="library-toast no-drag-region" role="status" aria-live="polite">
      {text}
    </div>
  )
}
