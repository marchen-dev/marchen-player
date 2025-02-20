import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@renderer/lib/utils'
import * as React from 'react'

const Slider = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  ref?: React.RefObject<React.ElementRef<typeof SliderPrimitive.Root>>
}) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-cn-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-cn-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-5 rounded-full border-2 border-cn-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
