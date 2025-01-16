import * as Dialog from '@radix-ui/react-dialog'
import { useEventCallback } from '@renderer/hooks/use-event-callback'
import { useIsUnMounted } from '@renderer/hooks/use-is-unmounted'
import { nextFrame, stopPropagation } from '@renderer/lib/dom'
import { cn } from '@renderer/lib/utils'
import type { AnimationDefinition } from 'framer-motion'
import { m, useAnimationControls, useDragControls } from 'framer-motion'
import { useAtomValue, useSetAtom } from 'jotai'
import { selectAtom } from 'jotai/utils'
import type {
  FC,
  ForwardedRef,
  PointerEventHandler,
  PropsWithChildren,
  SyntheticEvent,
} from 'react'
import { createElement, Fragment, memo, useCallback, useEffect, useMemo, useRef } from 'react'

import { ButtonWithIcon } from '../../button'
import { Divider } from '../../divider'
import { MODAL_STACK_Z_INDEX, modalMotionConfig } from './constants'
import type { currentModalContextProps, ModalContentPropsInternal } from './Context'
import { CurrentModalContext, modalStackAtom } from './Context'
import type { ModalProps } from './types'

interface ModalInternalProps extends PropsWithChildren {
  item: ModalProps & { id: string }
  index: number
  isTop: boolean
  onClose?: (open: boolean) => void
  ref?: ForwardedRef<HTMLDivElement>
}

export const ModalInternal: FC<ModalInternalProps> = memo(function Modal({ ref, ...props }) {
  const { item, index, isTop, onClose: onPropsClose, children } = props
  const setStack = useSetAtom(modalStackAtom)
  const close = useEventCallback(() => {
    setStack((p) => p.filter((stack) => stack.id !== item.id))
    onPropsClose?.(false)
  })

  const currentIsClosing = useAtomValue(
    useMemo(
      () =>
        selectAtom(modalStackAtom, (atomValue) => atomValue.every((modal) => modal.id !== item.id)),
      [item.id],
    ),
  )
  useEffect(() => {
    if (currentIsClosing) {
      document.body.style.pointerEvents = 'auto'
    }
  }, [currentIsClosing])

  const onClose = useCallback(
    (open: boolean) => {
      if (!open) {
        close()
      }
    },
    [close],
  )

  const {
    wrapper: Wrapper = Fragment,
    CustomModalComponent,
    clickOutsideToDismiss,
    classNames,
    title,
    max,
    content,
  } = item

  const zIndexStyle = useMemo(() => ({ zIndex: MODAL_STACK_Z_INDEX + index + 1 }), [index])

  const dismiss = useCallback(
    (e: SyntheticEvent) => {
      stopPropagation(e)
      close()
    },
    [close],
  )

  const isUnmounted = useIsUnMounted()
  const animateController = useAnimationControls()
  const dragController = useDragControls()
  const handleDrag: PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      dragController.start(e)
    },
    [dragController],
  )

  const isSelectingRef = useRef(false)
  const handleSelectStart = useCallback(() => {
    isSelectingRef.current = true
  }, [])

  useEffect(() => {
    nextFrame(() => {
      animateController.start(modalMotionConfig.animate as AnimationDefinition)
    })
  }, [animateController])

  const noticeModal = useCallback(() => {
    animateController
      .start({
        scale: 1.05,
        transition: {
          duration: 0.06,
        },
      })
      .then(() => {
        if (isUnmounted.current) return
        animateController.start({
          scale: 1,
        })
      })
  }, [animateController])

  useEffect(() => {
    if (isTop) return
    animateController.start({
      scale: 0.96,
      y: 10,
    })
    return () => {
      try {
        animateController.stop()
        animateController.start({
          scale: 1,
          y: 0,
        })
      } catch {
        /* empty */
      }
    }
  }, [isTop])

  const ModalProps: ModalContentPropsInternal = useMemo(
    () => ({
      dismiss: () => close(),
    }),
    [close],
  )

  const edgeElementRef = useRef<HTMLDivElement>(null)

  const modalContentRef = useRef<HTMLDivElement>(null)

  const modalContextProps = useMemo<currentModalContextProps>(
    () => ({
      ...ModalProps,
      ref: modalContentRef,
    }),
    [ModalProps],
  )
  const finalChildren = (
    <CurrentModalContext value={modalContextProps}>
      {children ?? createElement(content, ModalProps)}
    </CurrentModalContext>
  )
  if (CustomModalComponent) {
    return (
      <Wrapper>
        <Dialog.Root open onOpenChange={onClose}>
          <Dialog.Portal>
            <Dialog.Content asChild ref={modalContentRef}>
              <div
                className={cn(
                  'fixed inset-0 z-20 overflow-auto',
                  currentIsClosing ? '!pointer-events-none' : 'pointer-events-auto',

                  classNames?.modalContainerClassName,
                )}
                onClick={clickOutsideToDismiss ? dismiss : undefined}
                style={zIndexStyle}
              >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                <div className="contents" onClick={stopPropagation}>
                  <CustomModalComponent>{finalChildren}</CustomModalComponent>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      <Dialog.Root open onOpenChange={onClose}>
        <Dialog.Portal>
          <Dialog.Content asChild ref={modalContentRef}>
            <div
              ref={edgeElementRef}
              id="modal-container"
              className={cn(
                'fixed inset-0 z-20 flex items-center justify-center',
                currentIsClosing ? '!pointer-events-none' : 'pointer-events-auto',
                classNames?.modalContainerClassName,
              )}
              style={zIndexStyle}
              onClick={clickOutsideToDismiss ? dismiss : noticeModal}
            >
              <m.div
                id="modal"
                ref={ref}
                style={zIndexStyle}
                {...modalMotionConfig}
                animate={animateController}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-lg',
                  'bg-zinc-50/90 dark:bg-neutral-900/90',
                  'p-2 shadow-2xl shadow-stone-300 backdrop-blur-sm dark:shadow-md dark:shadow-stone-800',
                  max
                    ? 'h-[90vh] w-[90vw]'
                    : 'max-h-[70vh] min-w-[300px] max-w-[90vw] lg:max-h-[calc(100vh-20rem)] lg:max-w-[70vw]',

                  'border border-slate-200 dark:border-neutral-800',
                  classNames?.modalClassName,
                )}
                onClick={stopPropagation}
                onKeyUp={handleSelectStart}
                drag
                dragControls={dragController}
                dragElastic={0}
                dragListener={false}
                dragMomentum={false}
                dragConstraints={edgeElementRef}
                whileDrag={{
                  cursor: 'grabbing',
                }}
              >
                <div
                  className="relative flex items-center justify-between px-2.5"
                  onPointerDownCapture={handleDrag}
                >
                  <Dialog.Title className="flex items-center gap-2 py-1 text-lg font-semibold">
                    <span>{title}</span>
                  </Dialog.Title>
                  <Dialog.DialogClose
                    onClick={close}
                    className={`no-drag-region z-[9] flex cursor-auto items-center`}
                  >
                    <ButtonWithIcon
                      icon="icon-[mingcute--close-line] text-lg"
                      className="hover:bg-base-200"
                    />
                  </Dialog.DialogClose>
                </div>
                <Divider className="mb-0 mt-2 shrink-0 border-slate-200 opacity-80 dark:border-neutral-800" />

                <div className="h-full shrink grow ">{finalChildren}</div>
              </m.div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Wrapper>
  )
})

export default ModalInternal
