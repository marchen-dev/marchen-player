import type { DanmakuListRow } from '@renderer/services/player-runtime/danmaku/danmaku-list'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { CONTENT_LANG, formatNumber } from '@renderer/lib/i18n'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { usePlaybackClock } from '@renderer/services/player-runtime/context'
import { blockDanmakuByText } from '@renderer/services/player-runtime/danmaku/block-danmaku-action'
import {
  createDanmakuBlocker,
  describeBlockHit,
} from '@renderer/services/player-runtime/danmaku/danmaku-block'
import {
  buildDanmakuList,
  filterDanmakuList,
  findCurrentRowIndex,
} from '@renderer/services/player-runtime/danmaku/danmaku-list'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useTranslationLookup } from '@renderer/services/translation/use-translation-lookup'
import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatTime } from '../../../../controls/utils'
import { useDanmakuSourceConfig } from '../../../danmaku-source-context'

const ALL_SOURCES = '__all__'
/** 单行弹幕的估算高度，长文本换行后由虚拟列表实测修正 */
const ESTIMATED_ROW_HEIGHT = 36
const CURRENT_ROW_REFRESH_INTERVAL = 500

/** 「来源」下方的入口行：显示实际在用的弹幕总数，点击后弹窗查看全部弹幕 */
export const DanmakuList = memo(() => {
  const { t } = useTranslation('danmaku')
  const { danmaku } = useDanmakuSourceConfig()
  const [open, setOpen] = useState(false)
  // 条数与弹窗内保持同一口径（已勾选来源、应用偏移后实际会显示的弹幕），不受繁简开关影响
  const total = useMemo(
    () => buildDanmakuList(danmaku, { simplified: false }).rows.length,
    [danmaku],
  )

  return (
    <FieldLayout title={t('list.title')}>
      <Button
        className="max-w-[80%] min-w-0 border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
        variant="outline"
        disabled={total === 0}
        onClick={() => {
          captureFeatureUsed('danmaku_list', 'open', total)
          setOpen(true)
        }}
      >
        <span className="truncate">
          {total === 0 ? t('list.empty') : t('list.viewAll', { total: formatNumber(total) })}
        </span>
      </Button>
      <DanmakuListDialog open={open} onOpenChange={setOpen} />
    </FieldLayout>
  )
})

interface DanmakuListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 弹窗渲染在设置侧栏内部并保持侧栏打开：关闭后回到原位置，
 * 播放器快捷键也继续处于被面板屏蔽的状态，方向键和空格不会误触发快进或暂停。
 */
const DanmakuListDialog = ({ open, onOpenChange }: DanmakuListDialogProps) => {
  const portalContainer = usePlayerPortalContainer()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        className="flex h-[680px] max-h-[80vh] flex-col sm:max-w-[760px]"
        aria-describedby={undefined}
      >
        {/* 内容仅在弹窗打开时挂载，关闭期间不保留数千行的派生数据 */}
        <DanmakuListBody />
      </DialogContent>
    </Dialog>
  )
}

const DanmakuListBody = () => {
  const { t } = useTranslation('danmaku')
  const { danmaku } = useDanmakuSourceConfig()
  const [{ danmakuBlock, enableTraditionalToSimplified, danmakuTranslation }] = usePlayerSettings()
  const translationEnabled = danmakuTranslation.enabled
  const clock = usePlaybackClock()
  const portalContainer = usePlayerPortalContainer()
  const [keyword, setKeyword] = useState('')
  // 输入框即时响应，过滤数千行的工作延后，避免连续输入时卡顿
  const deferredKeyword = useDeferredValue(keyword)
  const [sourceId, setSourceId] = useState(ALL_SOURCES)

  // 与屏幕使用同一个判定函数；规则变化（包括在本列表里屏蔽）后整表重新派生
  const blocker = useMemo(() => createDanmakuBlocker(danmakuBlock), [danmakuBlock])
  const list = useMemo(
    () => buildDanmakuList(danmaku, { simplified: enableTraditionalToSimplified, blocker }),
    [blocker, danmaku, enableTraditionalToSimplified],
  )
  // 与画面使用同一份译文表；查询函数随译文的产生按固定间隔更新
  const translate = useTranslationLookup(translationEnabled)
  // 没有输入关键词时过滤结果与译文无关，避免译文每次刷新都重算数千行
  const searchTranslate = deferredKeyword.trim() ? translate : undefined
  const rows = useMemo(
    () =>
      filterDanmakuList(list.rows, {
        keyword: deferredKeyword,
        sourceId: sourceId === ALL_SOURCES ? undefined : sourceId,
        translate: searchTranslate,
      }),
    [deferredKeyword, list.rows, searchTranslate, sourceId],
  )
  const showSource = list.sources.length > 1
  const filtered = rows.length !== list.rows.length

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => rows[index].key,
    overscan: 12,
  })

  // 定时采样播放时间，高亮行由采样值派生，跟随播放进度移动
  const [now, setNow] = useState(() => clock.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(clock.now()), CURRENT_ROW_REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [clock])
  const currentIndex = useMemo(() => findCurrentRowIndex(rows, now), [now, rows])

  // 首次打开定位到当前播放位置；之后筛选条件变化时回到顶部查看结果。
  // clock 与 virtualizer 实例在弹窗生命周期内稳定，实际只随 rows 变化执行。
  const positionedRef = useRef(false)
  useEffect(() => {
    if (!positionedRef.current) {
      positionedRef.current = true
      const index = findCurrentRowIndex(rows, clock.now())
      if (index > 0) virtualizer.scrollToIndex(index, { align: 'center' })
      return
    }
    virtualizer.scrollToOffset(0)
  }, [clock, rows, virtualizer])

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-baseline gap-3 text-xl">
          {t('list.title')}
          <span className="text-muted-foreground text-sm font-normal">
            {filtered
              ? t('list.filteredCount', {
                  shown: formatNumber(rows.length),
                  total: formatNumber(list.rows.length),
                })
              : t('list.totalCount', { total: formatNumber(list.rows.length) })}
          </span>
        </DialogTitle>
      </DialogHeader>
      <div className="flex gap-2">
        <Input
          type="search"
          value={keyword}
          placeholder={t('list.searchPlaceholder')}
          aria-label={t('list.searchPlaceholder')}
          className="min-w-0 flex-1"
          onChange={(event) => setKeyword(event.target.value)}
        />
        {showSource && (
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger className="w-56 shrink-0" aria-label={t('list.sourceFilterLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value={ALL_SOURCES}>{t('list.allSources')}</SelectItem>
              {list.sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {t('source.withCount', {
                    name: source.name,
                    total: formatNumber(source.count),
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border text-sm">
        <div
          className={cn(
            'text-muted-foreground bg-muted/50 grid shrink-0 gap-3 border-b px-4 py-2 text-xs',
            rowGridClassName(showSource),
          )}
        >
          <span>{t('list.columns.time')}</span>
          <span>{t('list.columns.content')}</span>
          {showSource && <span>{t('list.columns.source')}</span>}
          <span aria-hidden />
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center">
            {filtered ? t('list.noMatch') : t('list.noEnabled')}
          </p>
        ) : (
          // 使用项目统一的 ScrollArea；长列表需要看到当前位置，滚动条常驻而不是悬停才出现
          <ScrollArea
            type="auto"
            className="min-h-0 flex-1"
            classNames={{
              // Radix 视口内层默认 display: table，改为 block 才能让虚拟行按视口宽度布局
              viewport:
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&>div]:!block',
              // 共用组件的默认滑块颜色类未定义（透明），这里显式给出跟随主题的颜色
              thumb: 'bg-foreground/30',
            }}
            // 可滚动区域需要能获得焦点，才能用键盘滚动
            viewportProps={{ ref: scrollRef, tabIndex: 0 }}
          >
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <DanmakuRow
                    row={rows[virtualRow.index]}
                    translation={translate?.(rows[virtualRow.index].text)}
                    current={virtualRow.index === currentIndex}
                    showSource={showSource}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  )
}

const rowGridClassName = (showSource: boolean) =>
  // 末列是行内操作位（屏蔽按钮），宽度固定，避免悬停时内容列跳动
  showSource
    ? 'grid-cols-[4rem_minmax(0,1fr)_9rem_1.5rem]'
    : 'grid-cols-[4rem_minmax(0,1fr)_1.5rem]'

/** 只有顶部、底部弹幕在列表里带角标 */
const hasModeBadge = (mode: DanmakuListRow['mode']): mode is 'top' | 'bottom' =>
  mode === 'top' || mode === 'bottom'

interface DanmakuRowProps {
  row: DanmakuListRow
  /** 弹幕翻译开启且该条已翻译时的译文 */
  translation?: string
  current: boolean
  showSource: boolean
}

const DanmakuRow = memo(({ row, translation, current, showSource }: DanmakuRowProps) => {
  const { t } = useTranslation('danmaku')
  const modeLabel = hasModeBadge(row.mode) ? t(`list.modes.${row.mode}`) : undefined
  const blocked = Boolean(row.blocked)
  // 被屏蔽的行只减弱内容，不减弱整行：当前播放位置的高亮仍要看得清
  const dimmed = blocked && 'opacity-50'
  return (
    <div
      aria-current={current || undefined}
      className={cn(
        'group border-border/50 grid items-start gap-3 border-b px-4 py-2 leading-5',
        rowGridClassName(showSource),
        current && 'bg-accent shadow-[inset_2px_0_0_var(--color-primary)]',
      )}
    >
      <span className={cn('text-muted-foreground tabular-nums', dimmed)}>
        {formatTime(row.time)}
      </span>
      <span className={cn('flex min-w-0 items-start gap-2', dimmed)}>
        {/* 弹幕颜色点带描边，白色和黑色弹幕在浅色、深色主题下都能辨认 */}
        <span
          aria-hidden
          className="border-foreground/25 mt-1.5 size-2 shrink-0 rounded-full border"
          style={{ backgroundColor: row.color }}
        />
        {/* 全局默认禁止选中文本，这里单独放开，方便用鼠标选中复制弹幕内容 */}
        <span className="flex min-w-0 flex-col">
          <span className="min-w-0 break-words whitespace-pre-wrap select-text" lang={CONTENT_LANG}>
            {row.text}
          </span>
          {translation && (
            // 译文作为第二行对照显示；尚未翻译或不需要翻译的条目只有原文
            <span
              lang="en"
              className="text-muted-foreground min-w-0 break-words whitespace-pre-wrap select-text"
            >
              {translation}
            </span>
          )}
        </span>
        {modeLabel && (
          <span className="bg-muted text-muted-foreground shrink-0 rounded px-1 text-xs">
            {modeLabel}
          </span>
        )}
        {row.blocked && (
          // 悬停说明命中的是哪条规则或哪个类型，用来排查误伤；解除屏蔽统一在「弹幕屏蔽」里进行
          <span
            className="bg-muted text-muted-foreground shrink-0 rounded px-1 text-xs"
            title={describeBlockHit(row.blocked)}
          >
            {t('list.blocked')}
          </span>
        )}
      </span>
      {showSource && (
        <span className={cn('text-muted-foreground truncate', dimmed)} title={row.sourceName}>
          {row.sourceName}
        </span>
      )}
      {blocked ? (
        <span aria-hidden />
      ) : (
        <button
          type="button"
          title={t('list.block')}
          aria-label={t('list.blockAria', { text: row.text })}
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring invisible flex size-5 items-center justify-center rounded group-hover:visible focus-visible:visible focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => blockDanmakuByText(row.text, 'list')}
        >
          <span aria-hidden className="icon-[mingcute--forbid-circle-line] size-4" />
        </button>
      )}
    </div>
  )
})
