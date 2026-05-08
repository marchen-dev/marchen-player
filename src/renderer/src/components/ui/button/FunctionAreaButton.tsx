import type { ButtonProps } from '@renderer/components/ui/button'
import type { Toggle as TogglePrimitive } from 'radix-ui'
import type { ComponentPropsWithRef, FC, PropsWithChildren } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Toggle } from '@renderer/components/ui/toggle'
import { cn } from '@renderer/lib/utils'

export const FunctionAreaButton: FC<PropsWithChildren & ButtonProps> = ({ children, ...props }) => {
  return (
    <Button variant="icon" size="sm" className="text-xl" {...props}>
      {children}
    </Button>
  )
}

export const FunctionAreaToggle: FC<
  PropsWithChildren & React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>
> = ({ children, ...props }) => {
  return (
    <Toggle size="sm" className="text-xl" {...props}>
      {children}
    </Toggle>
  )
}

export const ButtonWithIcon: FC<
  PropsWithChildren & ComponentPropsWithRef<'button'> & { icon: string }
> = ({ children, className, icon, ...props }) => {
  return (
    <button
      type="button"
      className={cn(
        'no-drag-region hover:bg-accent flex size-8 cursor-default items-center justify-center rounded-md transition-colors',
        className,
      )}
      {...props}
    >
      <i className={cn('text-xl', icon)} />
    </button>
  )
}
