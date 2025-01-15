import { cn } from '@renderer/lib/utils'
import type { HTMLMotionProps, Target } from 'framer-motion'
import { m } from 'framer-motion'
import type { ForwardRefExoticComponent, PropsWithChildren, RefAttributes } from 'react'
import { memo } from 'react'

export interface CreateTranstionParams {
  from?: Target
  to?: Target
  exit?: Target
}

export interface TransitionViewProps extends HTMLMotionProps<'div'> {
  lcpOptimization?: boolean
  as?: keyof typeof m
  duration?: number
}

export const createTransition = (params: CreateTranstionParams) => {
  const { from, to, exit } = params

  const TransitionView = ({
    ref,
    ...props
  }: PropsWithChildren<TransitionViewProps> & { ref?: React.RefObject<HTMLElement | null> }) => {
    const { as = 'div', duration = 0.2, children, className, ...rest } = props
    const MotionComponent = m[as] as ForwardRefExoticComponent<
      HTMLMotionProps<any> & RefAttributes<HTMLElement>
    >
    const motionProps = {
      initial: from,
      animate: to,
      exit,
      transition: {
        duration,
      },
    }

    return (
      <MotionComponent ref={ref} {...motionProps} {...rest} className={cn('h-full', className)}>
        {children}
      </MotionComponent>
    )
  }

  TransitionView.displayName = 'TransitionView'

  const MemoTransitionView = memo(TransitionView)
  MemoTransitionView.displayName = 'MemoTransitionView'
  return MemoTransitionView
}
