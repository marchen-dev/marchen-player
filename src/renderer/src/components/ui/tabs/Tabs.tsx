import { cn } from '@renderer/lib/utils'
import { Tabs as TabsPrimitive } from 'radix-ui'
import * as React from 'react'

const Tabs = TabsPrimitive.Root

const TabsList = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.List>>
}) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1',
      className,
    )}
    {...props}
  />
)
TabsList.displayName = TabsPrimitive.List.displayName

/**
 * 分段控件选中项样式：raised 在浅色下是白色浮起块，深色下比控件底色（muted）高一档，
 * 避免沿用 bg-background 导致选中项比周围更暗。TabsTrigger 与手写的分段按钮共用这一份。
 */
export const segmentedActiveClassName =
  'bg-raised text-foreground shadow-sm hover:bg-raised hover:text-foreground'

const TabsTrigger = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.Trigger>>
}) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'ring-offset-background inline-flex cursor-default items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
      'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none',
      'data-[state=active]:bg-raised data-[state=active]:text-foreground disabled:opacity-50 data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.Content>>
}) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      className,
    )}
    {...props}
  />
)
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsContent, TabsList, TabsTrigger }
