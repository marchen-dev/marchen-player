import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@renderer/lib/utils'
import * as React from 'react'

const Progress = ({
  ref,
  className,
  value,
  ...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
  ref?: React.RefObject<React.ElementRef<typeof ProgressPrimitive.Root>>
}) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('bg-cn-secondary relative h-4 w-full overflow-hidden rounded-full', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="bg-cn-primary size-full flex-1 transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
)
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
