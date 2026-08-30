import type { DB_History } from '@renderer/database/schemas/history'
import { videoAtom } from '@renderer/atoms/player'
import { db } from '@renderer/database/db'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { createContext, use } from 'react'

export const danmakuSourceQueryKey = 'player-danmaku-source'

const DanmakuSourceContext = createContext<DB_History | null>(null)

export const DanmakuSourceProvider = ({ children }: React.PropsWithChildren) => {
  const { hash } = useAtomValue(videoAtom)
  const { data, error, isPending } = useQuery({
    queryKey: [danmakuSourceQueryKey, hash],
    queryFn: () => db.history.get(hash),
    enabled: Boolean(hash),
  })

  if (isPending) {
    return <p className="text-sm text-[var(--player-settings-muted)]">正在读取弹幕来源…</p>
  }
  if (error) {
    return <p className="text-sm text-red-300">弹幕来源读取失败，显示设置仍可使用。</p>
  }
  if (!data) {
    return <p className="text-sm text-[var(--player-settings-muted)]">暂无弹幕来源记录。</p>
  }
  return <DanmakuSourceContext value={data}>{children}</DanmakuSourceContext>
}

export const useDanmakuSourceConfig = () => {
  const context = use(DanmakuSourceContext)
  if (!context) throw new Error('useDanmakuSourceConfig must be used within DanmakuSourceProvider')
  return context
}
