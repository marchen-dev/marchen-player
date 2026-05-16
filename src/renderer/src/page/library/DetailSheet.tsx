import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@renderer/components/ui/sheet'

import { AnimeInfo } from './AnimeInfo'
import { EpisodeList } from './EpisodeList'

interface DetailSheetProps {
  item: DB_Library | null
  onClose: () => void
}

export const DetailSheet: FC<DetailSheetProps> = ({ item, onClose }) => {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        {item && (
          <>
            <SheetHeader className="px-6 pt-6 pb-0">
              <SheetTitle className="text-base">{item.title}</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 px-6 pb-6">
              <div className="space-y-4 pt-4">
                <AnimeInfo item={item} />
                <EpisodeList item={item} onClose={onClose} />
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
