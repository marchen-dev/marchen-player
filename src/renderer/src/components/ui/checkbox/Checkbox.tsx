'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cn } from '@renderer/lib/utils'
import { Check } from 'lucide-react'
import * as React from 'react'

const Checkbox = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
  ref?: React.RefObject<React.ElementRef<typeof CheckboxPrimitive.Root>>
}) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer border-cn-primary ring-offset-background focus-visible:ring-ring data-[state=checked]:bg-cn-primary data-[state=checked]:text-cn-primary-foreground size-4 shrink-0 rounded-sm border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="size-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
)
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
