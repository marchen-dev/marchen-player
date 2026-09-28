import type { FC, ForwardedRef } from 'react'
import { cn } from '@renderer/lib/utils'
import { m } from 'framer-motion'

import { DIALOG_OVERLAY_CLASS_NAME, dialogOverlayMotionConfig } from '../../dialog/visual'
import { RootPortal } from '../../portal'

interface ModalOverlayProps {
  zIndex?: number
  ref?: ForwardedRef<HTMLDivElement>
}
export const ModalOverlay: FC<ModalOverlayProps> = ({ ref, ...props }) => {
  const { zIndex } = props
  return (
    <RootPortal>
      <m.div
        id="modal-overlay"
        // 与 shadcn Dialog 共用深色遮罩与淡入淡出参数
        className={cn('pointer-events-none fixed inset-0', DIALOG_OVERLAY_CLASS_NAME)}
        {...dialogOverlayMotionConfig}
        style={{ zIndex }}
        ref={ref}
      />
    </RootPortal>
  )
}
