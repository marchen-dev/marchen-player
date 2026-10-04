import { cn } from '@renderer/lib/utils'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import * as React from 'react'

const ScrollArea = ({
  ref,
  className,
  classNames,
  viewportProps,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  classNames?: { scrollBar?: string; viewport?: string; thumb?: string }
  /** 透传给滚动视口，供虚拟列表获取滚动元素或让视口可聚焦 */
  viewportProps?: Omit<
    React.ComponentPropsWithRef<typeof ScrollAreaPrimitive.Viewport>,
    'className' | 'children'
  >
} & { ref?: React.RefObject<React.ElementRef<typeof ScrollAreaPrimitive.Root>> }) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      {...viewportProps}
      className={cn('size-full rounded-[inherit]', classNames?.viewport)}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar className={classNames?.scrollBar} thumbClassName={classNames?.thumb} />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = ({
  ref,
  className,
  thumbClassName,
  orientation = 'vertical',
  ...props
}: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & {
  thumbClassName?: string
  ref?: React.RefObject<React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>>
}) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none transition-colors select-none',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn('bg-neutral-content relative flex-1 rounded-full', thumbClassName)}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
)
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
