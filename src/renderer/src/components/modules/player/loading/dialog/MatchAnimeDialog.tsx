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
import { CONTENT_LANG } from '@renderer/lib/i18n'
import { cn } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('player')
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
          <DialogTitle className="text-xl">{t('matchDialog.title')}</DialogTitle>
          <DialogDescription>
            {props.allowLocalImport
              ? t('matchDialog.descriptionWithImport')
              : t('matchDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3">
          <Input
            placeholder={t('matchDialog.searchPlaceholder')}
            onChange={handleSearchAnime}
            disabled={importing}
          />
          <ScrollArea
            className={cn(
              'relative min-h-0 shrink rounded-md border px-4',
              isLoading ? 'h-[480px]' : 'h-[550px]',
            )}
          >
            <Accordion type="single" collapsible className="w-full">
              {accordionData?.length === 0 && (
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {t('matchDialog.empty')}
                </p>
              )}
              {accordionData?.map((match) => {
                const { animeId, animeTitle } = match[0]

                return (
                  // 番剧与剧集标题来自弹弹play，固定按中文内容标注
                  <AccordionItem key={animeId} value={`${animeId}`} lang={CONTENT_LANG}>
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
                                title: t('matchDialog.selectedTitle'),
                                description: t('matchDialog.selectedDescription', {
                                  anime: animeTitle ?? '',
                                  episode: item.episodeTitle ?? '',
                                }),
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
                <p className="text-muted-foreground text-xs">{t('matchDialog.formats')}</p>
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
                <span>{t('matchDialog.later')}</span>
              </Button>
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
