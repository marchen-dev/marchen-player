import { cn } from '@renderer/lib/utils'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'
import { DIALOG_OVERLAY_CLASS_NAME } from './visual'

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Overlay>>
}) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-(--z-dialog) !cursor-default',
      DIALOG_OVERLAY_CLASS_NAME,
      'data-[state=open]:animate-dialog-overlay-in data-[state=closed]:animate-dialog-overlay-out motion-reduce:animate-none',
      className,
    )}
    {...props}
  />
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = ({
  ref,
  onClosed,
  container,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  onClosed?: () => void
  container?: Element | DocumentFragment | null
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Content>>
}) => (
  <DialogPortal container={container}>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed top-[50%] left-[50%] z-(--z-dialog) grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] cursor-default gap-4',
        // 实心面板保证表单可读性；柔和大阴影替代硬边框，突出层级
        'bg-background border-border/60 rounded-xl border p-6 shadow-2xl shadow-black/20',
        // 仅缩放 + 轻微上浮，不再叠加旧式 slide-in-from-* 导致的斜向滑入
        'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        onClick={onClosed}
        className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 cursor-default rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
      >
        <X className="size-4" />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex cursor-default flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Title>>
}) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg leading-none font-semibold tracking-tight', className)}
    {...props}
  />
)
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Description>>
}) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
)
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
