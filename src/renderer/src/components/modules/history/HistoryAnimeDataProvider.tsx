import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import type { DB_Bangumi } from '@renderer/database/schemas/bangumi'
import type { DB_History } from '@renderer/database/schemas/history'
import { RouteName } from '@renderer/router'
import { useQuery } from '@tanstack/react-query'
import type { FC, PropsWithChildren } from 'react'
import { createContext, use } from 'react'
import { useNavigate, useParams } from 'react-router'

interface AnimeDataContextType {
  bangumiData: DB_Bangumi
  episodeData: DB_History[]
}

const AnimeDataContext = createContext<AnimeDataContextType | null>(null)

export const HistoryAnimeDataProvider: FC<PropsWithChildren> = ({ children }) => {
  const { animeId } = useParams()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { isLoading, data } = useQuery({
    queryKey: [RouteName.HISTORY, animeId],
    queryFn: async () => {
      if (!animeId) {
        return
      }
      const bangumiData = await db.bangumi.get(+animeId)
      const episodeData = await db.history.where({ animeId: +animeId }).toArray()
      if (!bangumiData) {
        return
      }
      return {
        bangumiData,
        episodeData,
      }
    },
  })
  if (isLoading) {
    return null
  }
  if (!data) {
    toast({
      title: '错误',
      description: '未找到该番剧',
    })
    navigate(RouteName.HISTORY)
    return null
  }
  return <AnimeDataContext value={data}>{children}</AnimeDataContext>
}

export const useHistoryAnimeData = () => {
  const context = use(AnimeDataContext)
  if (!context) {
    throw new Error('useHistoryAnimeData must be used within a HistoryAnimeDataProvider')
  }
  return context
}
