import type { DanmakuBlockRule } from '@renderer/services/player-runtime/danmaku/danmaku-block-settings'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import {
  addBlockRule,
  createDanmakuBlocker,
  formatBlockRule,
  parseBlockRuleInput,
  removeBlockRule,
} from '@renderer/services/player-runtime/danmaku/danmaku-block'
import {
  DANMAKU_BLOCK_MODES,
  MAX_DANMAKU_BLOCK_RULES,
} from '@renderer/services/player-runtime/danmaku/danmaku-block-settings'
import { buildDanmakuList } from '@renderer/services/player-runtime/danmaku/danmaku-list'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { useDanmakuSourceConfig } from '../../../danmaku-source-context'

const MODE_LABELS: Record<(typeof DANMAKU_BLOCK_MODES)[number], string> = {
  scroll: '滚动',
  top: '顶部',
  bottom: '底部',
}
/** 重复添加时已有标签的强调时长 */
const HIGHLIGHT_DURATION = 1200

const ruleKey = (rule: DanmakuBlockRule) => `${rule.type}:${rule.pattern}`

/** 「弹幕列表」下方的入口行：显示规则数量，点击后弹窗管理全局屏蔽规则 */
export const DanmakuBlock = memo(() => {
  const [{ danmakuBlock }] = usePlayerSettings()
  const [open, setOpen] = useState(false)
  const ruleCount = danmakuBlock.rules.length

  return (
    <FieldLayout title="弹幕屏蔽">
      <Button
        className="max-w-[80%] min-w-0 border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {ruleCount === 0 ? '添加屏蔽规则' : `管理 ${ruleCount.toLocaleString('zh-CN')} 条规则`}
        </span>
      </Button>
      <DanmakuBlockDialog open={open} onOpenChange={setOpen} />
    </FieldLayout>
  )
})

interface DanmakuBlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 与弹幕列表弹窗相同：渲染在设置侧栏内部并挂到播放器 portal 容器，保证全屏可见 */
const DanmakuBlockDialog = ({ open, onOpenChange }: DanmakuBlockDialogProps) => {
  const portalContainer = usePlayerPortalContainer()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        className="flex max-h-[80vh] flex-col sm:max-w-[560px]"
        aria-describedby={undefined}
      >
        {/* 内容仅在弹窗打开时挂载，关闭期间不做已屏蔽条数的统计 */}
        <DanmakuBlockBody />
      </DialogContent>
    </Dialog>
  )
}

const DanmakuBlockBody = () => {
  const { danmaku } = useDanmakuSourceConfig()
  const [{ danmakuBlock }, setPlayerSetting] = usePlayerSettings()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { enabled, modes, rules } = danmakuBlock

  // 口径与「弹幕列表」的总条数一致：已勾选来源、应用偏移后实际在用的弹幕
  const blockedCount = useMemo(
    () =>
      enabled
        ? buildDanmakuList(danmaku, {
            simplified: false,
            blocker: createDanmakuBlocker(danmakuBlock),
          }).blockedCount
        : 0,
    [danmaku, danmakuBlock, enabled],
  )

  // 打开时记录一次当前的已屏蔽条数，用于观察屏蔽的实际作用范围
  const openCountRef = useRef(blockedCount)
  useEffect(() => {
    captureFeatureUsed('danmaku_block', 'open', openCountRef.current)
  }, [])

  useEffect(() => {
    if (!highlightKey) return
    const timer = setTimeout(setHighlightKey, HIGHLIGHT_DURATION, null)
    return () => clearTimeout(timer)
  }, [highlightKey])

  const updateBlock = (updater: (current: typeof danmakuBlock) => typeof danmakuBlock) =>
    setPlayerSetting((previous) => ({ ...previous, danmakuBlock: updater(previous.danmakuBlock) }))

  const submit = () => {
    const parsed = parseBlockRuleInput(input)
    if (!parsed.ok) {
      // 空内容静默忽略；其余错误保留输入，方便直接修改
      setError(parsed.reason === 'empty' ? null : parsed.message)
      return
    }
    const result = addBlockRule(danmakuBlock, parsed.rule)
    if (result.status === 'limit') {
      setError(`规则已达上限（${MAX_DANMAKU_BLOCK_RULES} 条），请先移除不需要的规则`)
      return
    }
    if (result.status === 'exists') {
      setHighlightKey(ruleKey(parsed.rule))
    } else {
      updateBlock((current) => {
        const next = addBlockRule(current, parsed.rule)
        return next.status === 'added' ? next.settings : current
      })
      captureFeatureUsed(
        'danmaku_block',
        parsed.rule.type === 'regex' ? 'add_regex' : 'add_keyword',
        'dialog',
      )
    }
    setInput('')
    setError(null)
    // 点「添加」按钮提交时焦点会离开输入框，拉回来以便连续录入
    inputRef.current?.focus()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-baseline gap-3 text-xl">
          弹幕屏蔽
          {enabled && (
            <span className="text-muted-foreground text-sm font-normal">
              本集已屏蔽 {blockedCount.toLocaleString('zh-CN')} 条
            </span>
          )}
        </DialogTitle>
      </DialogHeader>
      <FieldLayout title={<span id="danmaku-block-enabled">启用屏蔽</span>} className="text-sm">
        <SettingSwitch
          aria-labelledby="danmaku-block-enabled"
          playerMaterial
          value={enabled}
          onCheckedChange={(value) => {
            captureFeatureUsed('danmaku_block', value ? 'enable' : 'disable')
            updateBlock((current) => ({ ...current, enabled: value }))
          }}
        />
      </FieldLayout>
      {/* 总开关关闭时只减弱外观，不禁用：规则仍然保留并且可以编辑 */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 transition-opacity',
          !enabled && 'opacity-50',
        )}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">屏蔽类型</span>
          <div className="flex items-center gap-5">
            {DANMAKU_BLOCK_MODES.map((mode) => (
              <label key={mode} className="flex items-center gap-2">
                <Checkbox
                  // 未选中时用中性描边，三个并排的亮蓝空框过于抢眼；选中后才用强调色
                  className="border-foreground/35 data-[state=checked]:border-primary"
                  checked={modes[mode]}
                  onCheckedChange={(checked) => {
                    const value = checked === true
                    captureFeatureUsed(
                      'danmaku_block',
                      value ? 'mode_enable' : 'mode_disable',
                      mode,
                    )
                    updateBlock((current) => ({
                      ...current,
                      modes: { ...current.modes, [mode]: value },
                    }))
                  }}
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
          </div>
        </div>
        <form
          className="space-y-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              placeholder="输入关键词，或用 /…/ 写正则"
              aria-label="屏蔽规则"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'danmaku-block-error' : undefined}
              className="min-w-0 flex-1"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setInput(event.target.value)
                setError(null)
              }}
            />
            {/* 中性填充：强调色只留给开关和选中态，避免面板上出现大块亮蓝 */}
            <Button type="submit" variant="secondary" className="shrink-0">
              添加
            </Button>
          </div>
          {error && (
            <p id="danmaku-block-error" role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </form>
        {rules.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
            还没有屏蔽规则。也可以在画面上悬停弹幕直接屏蔽。
          </p>
        ) : (
          <ScrollArea
            type="auto"
            className="rounded-md border"
            // 高度上限必须加在视口上：Radix 视口是实际的滚动元素，加在根节点只会裁掉内容
            classNames={{ viewport: 'max-h-64', thumb: 'bg-foreground/30' }}
          >
            <ul className="flex flex-wrap gap-2 p-3" aria-label="屏蔽规则列表">
              {rules.map((rule) => (
                <RuleChip
                  key={ruleKey(rule)}
                  rule={rule}
                  highlighted={highlightKey === ruleKey(rule)}
                  onRemove={() => {
                    captureFeatureUsed('danmaku_block', 'remove_rule')
                    updateBlock((current) => removeBlockRule(current, rule))
                  }}
                />
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </>
  )
}

interface RuleChipProps {
  rule: DanmakuBlockRule
  highlighted: boolean
  onRemove: () => void
}

const RuleChip = ({ rule, highlighted, onRemove }: RuleChipProps) => {
  const ref = useRef<HTMLLIElement>(null)
  const text = formatBlockRule(rule)

  // 重复添加时把已有标签滚入视野，配合描边提示「这条已经有了」
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <li
      ref={ref}
      className={cn(
        'bg-muted flex max-w-full items-center gap-1 rounded-md border py-1 pr-1 pl-2 text-sm transition-shadow',
        highlighted && 'ring-primary ring-2',
      )}
    >
      {/* 正则用等宽字体并带斜杠，与关键词区分 */}
      <span className={cn('min-w-0 truncate', rule.type === 'regex' && 'font-mono')} title={text}>
        {text}
      </span>
      <button
        type="button"
        aria-label={`移除规则 ${text}`}
        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring flex size-5 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
        onClick={onRemove}
      >
        <span aria-hidden className="icon-[mingcute--close-line] size-3.5" />
      </button>
    </li>
  )
}
