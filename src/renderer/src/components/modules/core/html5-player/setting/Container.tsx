import type { FC, PropsWithChildren } from 'react'

export const SettingContainer: FC<PropsWithChildren> = ({ children }) => {
  return <section className="space-y-3">{children}</section>
}
