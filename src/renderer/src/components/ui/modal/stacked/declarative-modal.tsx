import { jotaiStore } from '@renderer/atoms/store'
import { cn } from '@renderer/lib/utils'
import { AnimatePresence } from 'framer-motion'
import type { FC, PropsWithChildren, ReactNode } from 'react'
import { useId, useMemo } from 'react'

import { modalStackAtom } from './Context'
import { ModalInternal } from './Modal'
import type { ModalProps } from './types'

export interface DeclarativeModalProps extends Omit<ModalProps, 'content'> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode

  id?: string
}

const Noop = () => null
const DeclarativeModalImpl: FC<DeclarativeModalProps> = ({
  open,
  onOpenChange,
  children,
  ...rest
}) => {
  const index = useMemo(() => jotaiStore.get(modalStackAtom).length, [])

  const id = useId()
  const item = useMemo(
    () => ({
      ...rest,
      content: Noop,
      id,
    }),
    [id, rest],
  )
  return (
    <AnimatePresence>
      {open && (
        <ModalInternal isTop onClose={onOpenChange} index={index} item={item}>
          {children}
        </ModalInternal>
      )}
    </AnimatePresence>
  )
}

const FooterAction: FC<PropsWithChildren<{ className: string }>> = ({ children, className }) => (
  <div className={cn('mt-4 flex items-center justify-end gap-2', className)}>{children}</div>
)

export const DeclarativeModal = Object.assign(DeclarativeModalImpl, {
  FooterAction,
})
