import { cn } from '@renderer/lib/utils'
import * as React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = ({
  ref,
  className,
  type,
  ...props
}: InputProps & { ref?: React.RefObject<HTMLInputElement | null> }) => {
  return (
    <input
      type={type}
      className={cn(
        'border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0',
        'file:text-foreground placeholder:text-muted-foreground file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
}
Input.displayName = 'Input'

export { Input }
