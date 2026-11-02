import type { DetailedHTMLProps, FC, HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export const Divider: FC<DetailedHTMLProps<HTMLAttributes<HTMLHRElement>, HTMLHRElement>> = (
  props,
) => {
  const { className, ...rest } = props
  return <hr className={cn('bg-border my-4 h-px border-0', className)} {...rest} />
}

export const DividerVertical: FC<
  DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>
> = (props) => {
  const { className, ...rest } = props
  return (
    <span
      className={cn(
        'bg-border mx-4 inline-block h-full w-px text-transparent select-none',
        className,
      )}
      {...rest}
    >
      w
    </span>
  )
}
