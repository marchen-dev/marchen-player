import type { LinkDanmakuEntry, LinkSelection } from '@marchen/shared/danmaku'
import { validateOffset } from '@marchen/shared/danmaku'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Progress } from '@renderer/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { describeError } from '@renderer/lib/errors'
import { getLinkImportController } from '@renderer/services/danmaku'
import { getPlayerLoadingService } from '@renderer/services/player-loading'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

// 与字幕、来源控件保持同一套深色样式；焦点环不带 offset，避免在毛玻璃面板上出现白色双圈。
const inputClass =
  'border-white/11 bg-white/8 text-white placeholder:text-white/40 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0'
const buttonClass =
  'border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0'

/** 步进按钮连续点击时合并为一次保存，边看边调也不会频繁写入 HISTORY。 */
const SAVE_DEBOUNCE_MS = 300
const OFFSET_STEP = 0.1

const formatOffset = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

/** 新入口只存在于弹幕设置；平台识别交给适配层。 */
export function LinkDanmaku() {
  const { t } = useTranslation(['danmaku', 'common'])
  const controller = getLinkImportController()
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [url, setUrl] = useState(snapshot.url)
  const [source, setSource] = useState('')
  const state = usePlayerLoadingSelector((value) => value)
  const entries =
    state.step === 'ready' || state.step === 'reloading'
      ? state.danmaku.filter((entry) => entry.type === 'link')
      : []
  const selected = entries.find((entry) => entry.source === source) ?? entries.at(-1)
  const busy = snapshot.status === 'loading' || snapshot.status === 'committing'
  const canSubmit = !busy && state.step === 'ready' && url.trim() !== ''

  // 新来源一律以 0 秒导入，偏移在导入后按实际观感调整。
  const submit = () => {
    if (!canSubmit) return
    void controller.start(url.trim(), 0).then(() => {
      const added = controller.getSnapshot().source
      if (added) setSource(added)
    })
  }

  return (
    <section className="space-y-3 border-t border-white/10 pt-4" aria-label={t('link.title')}>
      {/* label 是行内元素，space-y 加在它身上的纵向外边距不生效；改为块级后与输入框的间距才是 12px */}
      <Label htmlFor="link-danmaku-url" className="block text-[var(--player-settings-muted)]">
        {t('link.title')}
      </Label>
      {/* 关闭原生校验：空链接直接禁用按钮，其余错误在状态区内联展示 */}
      <form
        noValidate
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          id="link-danmaku-url"
          aria-describedby="link-danmaku-status"
          aria-invalid={snapshot.status === 'error'}
          className={`min-w-0 flex-1 ${inputClass}`}
          value={url}
          onChange={(event) => {
            if (snapshot.status === 'selecting') controller.cancel()
            setUrl(event.target.value)
          }}
          placeholder={t('link.urlPlaceholder')}
          disabled={busy}
        />
        <Button type="submit" variant="outline" className={buttonClass} disabled={!canSubmit}>
          {t('link.add')}
        </Button>
      </form>
      <ImportStatus snapshot={snapshot} onCancel={controller.cancel} onRetry={submit} />
      {snapshot.status === 'selecting' && snapshot.selection && (
        <EpisodeSelection
          key={snapshot.url}
          selection={snapshot.selection}
          disabled={state.step !== 'ready'}
          onChoose={(episodeUrl) => {
            setUrl(episodeUrl)
            void controller.choose(episodeUrl).then(() => {
              const added = controller.getSnapshot().source
              if (added) setSource(added)
            })
          }}
        />
      )}
      {selected && <SourceOffset entries={entries} selected={selected} onSelect={setSource} />}
    </section>
  )
}

/** 整季链接不默认选择第一集，由用户确认与正在播放的视频对应的剧集。 */
function EpisodeSelection({
  selection,
  disabled,
  onChoose,
}: {
  selection: LinkSelection
  disabled: boolean
  onChoose: (url: string) => void
}) {
  const [episode, setEpisode] = useState('')
  const portalContainer = usePlayerPortalContainer()
  const { t } = useTranslation(['danmaku', 'common'])
  return (
    <div className="space-y-2">
      <p className="text-sm text-white">{selection.title}</p>
      <Select value={episode} onValueChange={setEpisode} disabled={disabled}>
        <SelectTrigger
          aria-label={t('link.chooseEpisodeLabel')}
          className="w-full border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0"
        >
          <SelectValue placeholder={t('link.chooseEpisodePlaceholder')} />
        </SelectTrigger>
        <SelectContent
          container={portalContainer}
          className="border-white/11 bg-player-popover player-glass text-white"
        >
          <SelectGroup>
            {selection.episodes.map((item) => (
              <SelectItem
                key={item.url}
                value={item.url}
                className="focus:bg-white/14 focus:text-white"
              >
                {item.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        className={buttonClass}
        disabled={disabled || !episode}
        onClick={() => onChoose(episode)}
      >
        {t('link.importEpisode')}
      </Button>
    </div>
  )
}

type Snapshot = ReturnType<ReturnType<typeof getLinkImportController>['getSnapshot']>

/** 单一状态区：按任务状态切换，空闲时不占位。 */
function ImportStatus({
  snapshot,
  onCancel,
  onRetry,
}: {
  snapshot: Snapshot
  onCancel: () => void
  onRetry: () => void
}) {
  const { status, message, progress } = snapshot
  const { t } = useTranslation(['danmaku', 'common'])
  if (status === 'idle') return null
  if (status === 'error') {
    return (
      <Alert
        id="link-danmaku-status"
        variant="destructive"
        className="flex items-center justify-between gap-3 border-red-400/40 bg-red-500/10 px-3 py-2 text-red-200"
      >
        <AlertDescription className="min-w-0 break-words">{message}</AlertDescription>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={`shrink-0 ${buttonClass}`}
          onClick={onRetry}
        >
          {t('common:action.retry')}
        </Button>
      </Alert>
    )
  }
  const loading = status === 'loading'
  // 总段数未知时不伪造百分比，只显示文字。
  const percent =
    loading && progress?.stage === 'comments' && progress.total
      ? Math.min(100, (progress.completed / progress.total) * 100)
      : undefined
  return (
    <div id="link-danmaku-status" role="status" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm break-words text-[var(--player-settings-muted)]">{message}</p>
        {(loading || status === 'selecting') && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`shrink-0 ${buttonClass}`}
            onClick={onCancel}
          >
            {t('common:action.cancel')}
          </Button>
        )}
      </div>
      {percent !== undefined && (
        <Progress
          value={percent}
          aria-label={t('link.progressLabel')}
          className="h-1.5 bg-white/12 [&>div]:bg-[var(--player-settings-accent)]"
        />
      )}
    </div>
  )
}

/** 已添加链接来源的偏移调整；多个来源时才显示选择器。 */
function SourceOffset({
  entries,
  selected,
  onSelect,
}: {
  entries: LinkDanmakuEntry[]
  selected: LinkDanmakuEntry
  onSelect: (source: string) => void
}) {
  const portalContainer = usePlayerPortalContainer()
  const { t } = useTranslation(['danmaku', 'common'])
  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <Label className="text-[var(--player-settings-muted)]">{t('link.offset.title')}</Label>
      {entries.length > 1 ? (
        <Select value={selected.source} onValueChange={onSelect}>
          <SelectTrigger
            aria-label={t('link.offset.sourceLabel')}
            className="w-full border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            container={portalContainer}
            className="border-white/11 bg-player-popover player-glass text-white"
          >
            <SelectGroup>
              {entries.map((entry) => (
                <SelectItem
                  key={entry.source}
                  value={entry.source}
                  className="focus:bg-white/14 focus:text-white"
                >
                  {entry.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <p className="truncate text-sm">{selected.title}</p>
      )}
      {/* 切换来源时重建步进器，丢弃上一个来源未保存的草稿 */}
      <OffsetStepper key={selected.source} entry={selected} />
      <p className="text-xs text-[var(--player-settings-muted)]">{t('link.offset.hint')}</p>
    </div>
  )
}

/**
 * 偏移步进器：数值即时更新，防抖后保存一次；
 * 保存失败回退到上次成功的偏移并提示。
 */
function OffsetStepper({ entry }: { entry: LinkDanmakuEntry }) {
  const saved = entry.offsetSeconds
  const { t } = useTranslation(['danmaku', 'common'])
  const [text, setText] = useState(() => formatOffset(saved))
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingRef = useRef<number>(undefined)

  const save = async (value: number) => {
    try {
      await getPlayerLoadingService().setDanmakuSourceOffset(entry.source, value)
    } catch (err) {
      // 服务端状态未变，显示回退为当前已保存的值。
      setText(formatOffset(getSavedOffset(entry.source) ?? saved))
      setError(describeError(err, t('link.offset.saveFailed')))
    }
  }

  const flush = () => {
    clearTimeout(timerRef.current)
    const value = pendingRef.current
    pendingRef.current = undefined
    if (value !== undefined) void save(value)
  }

  const schedule = (value: number, delay = SAVE_DEBOUNCE_MS) => {
    setText(formatOffset(value))
    setError('')
    pendingRef.current = value
    clearTimeout(timerRef.current)
    if (delay === 0) flush()
    else timerRef.current = setTimeout(flush, delay)
  }

  // 面板收起或切换来源时补存最后一次调整，避免连续点击后的值丢失。
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => flushRef.current(), [])

  const current = () => {
    const value = Number(text)
    return Number.isFinite(value) ? value : saved
  }
  const step = (delta: number) => {
    const next = Math.round((current() + delta) * 10) / 10
    schedule(Math.min(3600, Math.max(-3600, next)))
  }
  // 输入框在失焦或回车时生效，非法值回退到已保存的偏移。
  const commitText = () => {
    try {
      const value = validateOffset(text.trim() ? Number(text) : Number.NaN)
      if (value === (pendingRef.current ?? saved)) setText(formatOffset(value))
      else schedule(value, 0)
    } catch (err) {
      setText(formatOffset(saved))
      setError(describeError(err, t('link.offset.invalid')))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          aria-label={t('link.offset.earlier')}
          className={`size-10 shrink-0 px-0 ${buttonClass}`}
          onClick={() => step(-OFFSET_STEP)}
        >
          <i className="icon-[mingcute--minimize-line] size-4" />
        </Button>
        <div className="relative min-w-0 flex-1">
          <Input
            aria-label={t('link.offset.inputLabel')}
            inputMode="decimal"
            className={`pr-9 text-center tabular-nums ${inputClass}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitText()
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-white/50">
            {t('link.offset.unit')}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label={t('link.offset.later')}
          className={`size-10 shrink-0 px-0 ${buttonClass}`}
          onClick={() => step(OFFSET_STEP)}
        >
          <i className="icon-[mingcute--add-line] size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`shrink-0 ${buttonClass}`}
          disabled={current() === 0}
          onClick={() => schedule(0, 0)}
        >
          {t('link.offset.reset')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

/** 读取服务当前保存的偏移，失败回退时以最新持久化值为准。 */
function getSavedOffset(source: string) {
  const state = getPlayerLoadingService().currentState
  if (state.step !== 'ready' && state.step !== 'reloading') return undefined
  const entry = state.danmaku.find((item) => item.source === source)
  return entry?.type === 'link' ? entry.offsetSeconds : undefined
}
