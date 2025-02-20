import { cn } from '@renderer/lib/utils'
import { useCurrentRoute } from '@renderer/router'
import type { FC, PropsWithChildren, ReactNode } from 'react'

interface TitleBarLayoutProps extends PropsWithChildren {
  FunctionArea?: ReactNode
  title?: ReactNode
}

export const TitleBarLayout: FC<TitleBarLayoutProps> = ({ children, FunctionArea, title }) => {
  const currentRoute = useCurrentRoute()

  return (
    <div className={cn('relative flex h-full flex-col pt-1')}>
      <section className="flex h-14 items-center justify-between overflow-hidden border-b px-4 dark:border-zinc-600">
        <div>
          {title ?? (
            <h3 className="select-none align-middle text-lg font-medium">
              {currentRoute?.meta?.title}
            </h3>
          )}
        </div>
        {FunctionArea}
      </section>
      {children}
    </div>
  )
}
