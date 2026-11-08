import type { MatchedVideoType } from '@renderer/atoms/player'
import type { MatchResponseV2, MatchResultV2 } from '@renderer/request/models/match'
import type { FC } from 'react'
import Show from '@renderer/components/common/Show'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@renderer/components/ui/accordion'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { useToast } from '@renderer/components/ui/toast'
import { cn } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'

import { LocalDanmakuFileButton } from '../../setting/items/damaku/LocalDanmakuFileButton'

import { showMatchAnimeDialog, showMatchAnimeDialogAtom, useSearchAnime } from './hooks'

interface MatchAnimeDialogProps {
  allowLocalImport?: boolean
  onLocalImported?: () => void
  matchData?: MatchResponseV2
  onSelected?: (params?: MatchedVideoType) => void
  onClosed?: () => void
  isLoading?: boolean
  container?: Element | DocumentFragment | null
}

export const MatchAnimeDialog: FC<MatchAnimeDialogProps> = (props) => {
  const { handleSearchAnime, searchData } = useSearchAnime()
  const { matchData, onSelected, onClosed, isLoading, container } = props
  const cancelImportRef = useRef<(() => void) | null>(null)
  const [importing, setImporting] = useState(false)
  const { toast } = useToast()
  const { open } = useAtomValue(showMatchAnimeDialogAtom)

  useEffect(() => {
    if (!isLoading) {
      return
    }
    if (matchData && !matchData.isMatched) {
      showMatchAnimeDialog(true)
    }
  }, [isLoading, matchData])

  const accordionData = useMemo(() => {
    if (searchData) {
      return searchData.animes.map((anime) => {
        return anime.episodes.map((episode) => ({
          animeId: anime.animeId,
          animeTitle: anime.animeTitle,
          episodeId: episode.episodeId,
          episodeTitle: episode.episodeTitle,
        })) as MatchResultV2[]
      })
    }

    if (!matchData?.matches) return []

    const groupMatches = matchData.matches.reduce(
      (acc, match) => {
        if (!acc[match.animeId]) {
          acc[match.animeId] = []
        }

        acc[match.animeId].push(match)
        return acc
      },
      {} as Record<number, MatchResultV2[]>,
    )
    return Object.values(groupMatches)
  }, [matchData, searchData])
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) cancelImportRef.current?.()
        showMatchAnimeDialog(open)
      }}
    >
      <DialogContent
        container={container}
        className="flex max-h-[85vh] flex-col sm:max-w-[725px]"
        onClosed={onClosed}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">选择弹幕</DialogTitle>
          <DialogDescription>
            {props.allowLocalImport
              ? '搜索在线弹幕库，或导入自己的弹幕文件'
              : '搜索在线弹幕库并选择剧集'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3">
          <Input placeholder="输入作品名称搜索" onChange={handleSearchAnime} disabled={importing} />
          <ScrollArea
            className={cn(
              'relative min-h-0 shrink rounded-md border px-4',
              isLoading ? 'h-[480px]' : 'h-[550px]',
            )}
          >
            <Accordion type="single" collapsible className="w-full">
              {accordionData?.length === 0 && (
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  暂无匹配的弹幕库
                </p>
              )}
              {accordionData?.map((match) => {
                const { animeId, animeTitle } = match[0]

                return (
                  <AccordionItem key={animeId} value={`${animeId}`}>
                    <AccordionTrigger disabled={importing}>{animeTitle}</AccordionTrigger>
                    <AccordionContent>
                      <ul className="mt-2 space-y-5">
                        {match.map((item) => (
                          <li
                            key={item.episodeId}
                            onClick={() => {
                              if (importing) return
                              onSelected &&
                                onSelected({
                                  episodeId: item.episodeId,
                                  animeId: item.animeId,
                                  animeTitle: item.animeTitle || '',
                                  episodeTitle: item.episodeTitle || '',
                                })
                              showMatchAnimeDialog(false)
                              toast({
                                title: '已选择弹幕库',
                                description: `已选择 ${animeTitle} ${item.episodeTitle}`,
                              })
                            }}
                            className="hover:text-info"
                          >
                            {item.episodeTitle}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </ScrollArea>
          <div className="flex shrink-0 items-start justify-between gap-4 pt-2">
            {props.allowLocalImport && (
              <div className="space-y-2">
                <LocalDanmakuFileButton
                  cancelRef={cancelImportRef}
                  active={open}
                  onPendingChange={setImporting}
                  onImported={() => {
                    props.onLocalImported?.()
                    showMatchAnimeDialog(false)
                  }}
                />
                <p className="text-muted-foreground text-xs">支持 B 站 XML / JSON 格式</p>
              </div>
            )}
            <Show when={isLoading}>
              <Button
                variant="secondary"
                disabled={importing}
                className="ml-auto text-sm"
                onClick={() => {
                  showMatchAnimeDialog(false)
                  onSelected?.()
                }}
              >
                <i className="icon-[mingcute--play-circle-line] mr-1 text-lg" />
                <span>稍后选择</span>
              </Button>
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
