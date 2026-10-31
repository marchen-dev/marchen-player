import type { LoadingState } from '@marchen/player-loading'
import type { ProgressStep } from '@renderer/services/player-loading/loading-progress'
/**
 * 加载进度界面
 *
 * 用一条总进度条代替逐步 stepper：步骤长度按真实耗时分配、段内持续爬升，
 * 让用户感知到「正在快速推进」，而不是「卡在某一步」。进度模型见 loading-progress.ts。
 */

import type { ExtractAtomValue } from 'jotai'
import type { FC } from 'react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import {
  formatMediaBytes,
  remoteImportProgressAtom,
} from '@renderer/services/media/remote-progress'
import {
  usePlayerLoadingService,
  usePlayerLoadingState,
} from '@renderer/services/player-loading/hooks'
import {
  advanceProgress,
  progressTarget,
  toProgressStep,
} from '@renderer/services/player-loading/loading-progress'
import { AnimatePresence, m } from 'framer-motion'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'

/** 加载很快时（已匹配且有缓存）不闪出加载界面 */
const SHOW_DELAY_MS = 300
/** 先播放按钮延迟出现：一开始就摆出来等于告诉用户「这可能要等很久」 */
const PLAY_NOW_DELAY_MS = 1_500

type RemoteProgress = ExtractAtomValue<typeof remoteImportProgressAtom>

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export const LoadingProgress: FC = () => {
  const state = usePlayerLoadingState()
  const service = usePlayerLoadingService()
  const remote = useAtomValue(remoteImportProgressAtom)
  const [reducedMotion] = useState(prefersReducedMotion)

  const failed = state.step === 'match_failed'
  const waiting = state.step === 'waiting_user'
  const mapped = toProgressStep(state.step)
  const paused = mapped?.paused ?? true
  const barRef = useProgressBar(state, remote, reducedMotion)

  const [delayed, setDelayed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(setDelayed, SHOW_DELAY_MS, true)
    return () => clearTimeout(timer)
  }, [])

  // 匹配与获取弹幕阶段连续计时，进入匹配约 1.5s 后才露出先播放按钮
  const canPlayNow = state.step === 'matching' || state.step === 'loading_danmaku'
  const [playNowShown, setPlayNowShown] = useState(false)
  useEffect(() => {
    if (!canPlayNow || playNowShown) return
    const timer = setTimeout(setPlayNowShown, PLAY_NOW_DELAY_MS, true)
    return () => clearTimeout(timer)
  }, [canPlayNow, playNowShown])

  // 需要用户处理的状态立即显示，不等延迟
  const visible = delayed || failed || waiting
  const subtitle = getSubtitle(state, remote)

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-4 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <p
        role={failed ? 'alert' : 'status'}
        className={cn(
          'max-w-md truncate text-center text-sm font-medium',
          failed ? 'text-destructive' : 'text-foreground',
        )}
      >
        {getStatusText(state, remote)}
      </p>

      <div
        role="progressbar"
        aria-label="视频加载进度"
        className="bg-muted-foreground/15 relative h-1 w-[360px] max-w-[80vw] overflow-hidden rounded-full"
      >
        <div
          ref={barRef}
          className={cn(
            'absolute inset-0 origin-left overflow-hidden rounded-full transition-[transform,background-color] duration-150 ease-out',
            failed ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ transform: 'scaleX(0)' }}
        >
          {/* 等用户或失败时进度不再推进，高光一起停下 */}
          {!paused && (
            <div className="animate-loading-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-reduce:hidden" />
          )}
        </div>
      </div>

      {/* 固定高度避免文件名与作品名切换、按钮出现时整体跳动 */}
      <div className="relative h-5 w-full max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          <m.p
            key={subtitle}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="text-muted-foreground absolute inset-x-0 truncate text-center text-sm tabular-nums"
            title={subtitle}
          >
            {subtitle}
          </m.p>
        </AnimatePresence>
      </div>

      <div className="flex h-9 items-center gap-2">
        {failed ? (
          <>
            <Button onClick={() => service.playNow()}>直接播放</Button>
            <Button variant="secondary" onClick={() => service.retryMatch()}>
              重试匹配
            </Button>
            <Button variant="ghost" onClick={() => service.manualMatch()}>
              手动匹配
            </Button>
          </>
        ) : (
          canPlayNow && (
            // 相当于本次临时开启优先播放：先开播，未完成的匹配与弹幕在后台继续
            <Button
              variant="secondary"
              onClick={() => service.playNow()}
              tabIndex={playNowShown ? 0 : -1}
              aria-hidden={!playNowShown}
              className={cn(
                'transition-opacity duration-300',
                playNowShown ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              先播放，弹幕稍后加载
            </Button>
          )
        )}
      </div>
    </div>
  )
}

/**
 * 逐帧驱动进度条：直接写 transform，不触发 React 重渲染。
 * 每次加载由外层按会话重新挂载，进度从 0 开始；同一次加载内进度只增不减。
 */
function useProgressBar(state: LoadingState, remote: RemoteProgress, reducedMotion: boolean) {
  const barRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef({ state, remote, reducedMotion })
  useEffect(() => {
    latestRef.current = { state, remote, reducedMotion }
  })

  useEffect(() => {
    let frame = 0
    let progress = 0
    let isRemote = false
    let currentStep: ProgressStep | undefined
    let wasPaused = false
    let stepStartedAt = performance.now()

    const tick = (now: number) => {
      const { state, remote, reducedMotion } = latestRef.current
      const mapped = toProgressStep(state.step)
      if (mapped) {
        // 进入新步骤或从暂停恢复（例如失败后重试）时重新计时，进度本身保持单调
        if (mapped.step !== currentStep || (wasPaused && !mapped.paused)) {
          currentStep = mapped.step
          stepStartedAt = now
        }
        wasPaused = mapped.paused
        // 出现字节读取进度或远程来源后改用远程分段，之后不再切回
        isRemote ||=
          Boolean(remote) || ('video' in state && state.video?.source?.kind === 'remote-url')
        if (!mapped.paused) {
          const ratio =
            mapped.step === 'importing' && remote
              ? remote.stage === 'reading' && remote.total
                ? remote.received / remote.total
                : 0
              : undefined
          progress = advanceProgress(
            progress,
            progressTarget({
              step: mapped.step,
              profile: isRemote ? 'remote' : 'local',
              elapsedMs: now - stepStartedAt,
              ratio,
              reducedMotion,
            }),
          )
          if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return barRef
}

function getStatusText(state: LoadingState, remote: RemoteProgress): string {
  switch (state.step) {
    case 'importing':
      return remote?.stage === 'connecting' ? '正在连接视频来源…' : '正在读取视频…'
    case 'hashing':
      return '正在识别视频…'
    case 'matching':
      return '正在匹配番剧…'
    case 'loading_danmaku':
      return '正在获取弹幕…'
    case 'waiting_user':
      return '请选择匹配的剧集'
    case 'match_failed':
      return `匹配失败：${state.error.message}`
    default:
      return ''
  }
}

/** 副标题：远程导入显示读取字节，匹配前显示文件名，匹配后换成作品名与集名 */
function getSubtitle(state: LoadingState, remote: RemoteProgress): string {
  switch (state.step) {
    case 'importing':
      return remote?.stage === 'reading'
        ? `${formatMediaBytes(remote.received)} / ${formatMediaBytes(remote.total)}`
        : ''
    case 'hashing':
      return state.video.name ?? ''
    case 'matching':
    case 'waiting_user':
    case 'match_failed':
      return state.video.name
    case 'loading_danmaku':
      return [state.match.animeTitle, state.match.episodeTitle].filter(Boolean).join(' · ')
    default:
      return ''
  }
}
