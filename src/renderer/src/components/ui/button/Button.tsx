import { Slot } from '@radix-ui/react-slot'
import { cn } from '@renderer/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'
import * as React from 'react'

const buttonVariants = cva(
  'inline-flex cursor-auto items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-cn-primary text-cn-primary-foreground hover:bg-cn-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-cn-accent hover:text-accent-foreground',
        secondary: 'bg-cn-secondary text-cn-secondary-foreground hover:bg-cn-secondary/80',
        ghost: 'hover:bg-cn-accent hover:text-cn-accent-foreground',
        link: 'text-cn-primary underline-offset-4 hover:underline',
        icon: 'hover:bg-muted hover:text-muted-foreground ',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-2.5',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = ({
  ref,
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps & { ref?: React.RefObject<HTMLButtonElement> }) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
}
Button.displayName = 'Button'

export { Button, buttonVariants }
