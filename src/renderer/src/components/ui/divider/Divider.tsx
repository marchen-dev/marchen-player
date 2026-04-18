import type { DetailedHTMLProps, FC, HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export const Divider: FC<DetailedHTMLProps<HTMLAttributes<HTMLHRElement>, HTMLHRElement>> = (
  props,
) => {
  const { className, ...rest } = props
  return (
    <hr
      className={cn('!bg-opacity-30 my-4 h-[0.5px] border-0 bg-black dark:bg-white', className)}
      {...rest}
    />
  )
}

export const DividerVertical: FC<
  DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>
> = (props) => {
  const { className, ...rest } = props
  return (
    <span
      className={cn(
        '!bg-opacity-30 mx-4 inline-block h-full w-[0.5px] bg-black text-transparent select-none dark:bg-white',
        className,
      )}
      {...rest}
    >
      w
    </span>
  )
}
