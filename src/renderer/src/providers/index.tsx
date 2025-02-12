import { jotaiStore } from '@renderer/atoms/store'
import { ModalStackProvider } from '@renderer/components/ui/modal'
import { Toaster } from '@renderer/components/ui/toast'
import queryClient from '@renderer/lib/query-client'
import { QueryClientProvider, } from '@tanstack/react-query'
import { domMax, LazyMotion } from 'framer-motion'
import { Provider as JotaiProvider } from 'jotai'
import { ThemeProvider } from 'next-themes'
import type { FC, JSX, PropsWithChildren } from 'react'

import { ProviderComposer } from './ProviderComposer'

const contexts: JSX.Element[] = [
  <LazyMotion features={domMax} key="lazyMotion" />,
  <QueryClientProvider client={queryClient} key="queryClientProvider" />,
  <JotaiProvider store={jotaiStore} key="jotaiProvider" />,
  // @ts-ignore
  <ThemeProvider
    key="ThemeProvider"
    attribute={['data-theme', 'class']}
    themes={['cmyk', 'dark']}
  />,
  <ModalStackProvider key="modalStackProvider" />,
]
export const RootProviders: FC<PropsWithChildren> = ({ children }) => (
  <ProviderComposer contexts={contexts}>
    {children}

    <Toaster />
    {/* {isDev && <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-right" />} */}
  </ProviderComposer>
)
