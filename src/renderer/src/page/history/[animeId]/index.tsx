import { TitleBarLayout } from '@renderer/components/layout/root/TitleBarLayout'
import {
  HistoryAnimeDataProvider,
  useHistoryAnimeData,
} from '@renderer/components/modules/history/HistoryAnimeDataProvider'
import { HistoryDetailsContent } from '@renderer/components/modules/history/HistoryDetailsContent'
import { ButtonWithIcon } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { RouteName } from '@renderer/router'
import { m } from 'framer-motion'
import { Link } from 'react-router'

export const HistoryDetails = () => {
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <HistoryAnimeDataProvider>
        <TitleBarLayout title={<HistoryDetailsTitle />}>
          <ScrollArea>
            <HistoryDetailsContent />
          </ScrollArea>
        </TitleBarLayout>
      </HistoryAnimeDataProvider>
    </m.div>
  )
}

const HistoryDetailsTitle = () => {
  const { bangumiData, episodeData } = useHistoryAnimeData()
  return (
    <div className="flex items-center gap-2">
      <Link to={RouteName.HISTORY} className=" no-drag-region flex items-center">
        <ButtonWithIcon icon="icon-[mingcute--left-line] text-2xl" />
      </Link>
      <h3 className=" align-middle text-lg font-medium">
        {bangumiData?.title ?? episodeData[0]?.animeTitle}
      </h3>
    </div>
  )
}
