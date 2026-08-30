import type { DanmakuPlacement } from '@marchen/danmaku-engine'
import { readFileSync } from 'node:fs'
import {
  closePlayerSettingsPanel,
  getAvailablePlayerSettingsSections,
  initialPlayerSettingsPanelState,
  normalizePlayerSettingsSection,
  openPlayerSettingsPanel,
} from '@renderer/atoms/player-settings-state'
import { canStartControllerDrag } from '@renderer/components/modules/player/controls/controller-drag'
import { timelineTimeFromPointer } from '@renderer/components/modules/player/controls/timeline-scrubber-math'
import { volumeFromPointer } from '@renderer/components/modules/player/controls/volume-slider-math'
import {
  electronPlayerCapabilities,
  webPlayerCapabilities,
} from '@renderer/services/player-runtime/platform/capabilities'
import { describe, expect, it, vi } from 'vitest'
import {
  getDanmakuAnimationTiming,
  getDanmakuInitialTransform,
  normalizeMeasuredMetrics,
  rebaseAnimationDuration,
  requiresDanmakuLayoutReset,
} from '../danmaku/dom-danmaku-renderer'

const placement: DanmakuPlacement = {
  item: { id: '1', time: 1, text: '弹幕', mode: 'scroll', color: '#fff' },
  lane: 2,
  laneSpan: 1,
  y: 72,
  width: 120,
  height: 36,
  duration: 8,
  playbackRate: 1,
  startDelay: 0.08,
}

describe('播放器 UI 回归', () => {
  it('滚动弹幕入 DOM 前已经定位到画面右侧和目标轨道', () => {
    expect(getDanmakuInitialTransform(placement, 1280)).toBe('translate3d(1280px, 72px, 0)')
    expect(getDanmakuAnimationTiming(placement).fill).toBe('both')
  })

  it('固定弹幕入 DOM 前已经水平居中', () => {
    expect(
      getDanmakuInitialTransform({ ...placement, item: { ...placement.item, mode: 'top' } }, 1280),
    ).toBe('translate3d(580px, 72px, 0)')
  })

  it('dom 测量失败时使用不缩小包围盒的保守尺寸', () => {
    expect(normalizeMeasuredMetrics({ width: 0, height: 0 }, '四个文字', 20)).toEqual({
      width: 80,
      height: 27,
    })
  })

  it('renderer 保持批量测量与核心生命周期同步边界', () => {
    const rendererSource = readFileSync(
      new URL('../danmaku/dom-danmaku-renderer.ts', import.meta.url),
      'utf8',
    )
    expect(rendererSource).toContain('this.measureCandidates(items)')
    expect(rendererSource).toContain('this.engine.pauseItem(id)')
    expect(rendererSource).toContain('this.engine.resumeItem(id)')
    expect(rendererSource).toContain('this.engine.completeItem(id)')
    expect(rendererSource).toContain('this.engine.cancelItem(id)')
    expect(rendererSource).not.toContain('measureCanvas')
  })

  it('常规弹幕设置连续更新，只有显示开关和轨道间距触发重建', () => {
    const base = {
      enabled: true,
      duration: 8,
      fontSize: 26,
      displayArea: 0.5,
      maxOnScreen: 80,
      hoverPause: true,
    }
    expect(requiresDanmakuLayoutReset(base, { ...base, maxOnScreen: 40 })).toBe(false)
    expect(requiresDanmakuLayoutReset(base, { ...base, hoverPause: false })).toBe(false)
    expect(requiresDanmakuLayoutReset(base, { ...base, fontSize: 36 })).toBe(false)
    expect(requiresDanmakuLayoutReset(base, { ...base, duration: 12 })).toBe(false)
    expect(requiresDanmakuLayoutReset(base, { ...base, displayArea: 0.75 })).toBe(false)
    expect(requiresDanmakuLayoutReset(base, { ...base, enabled: false })).toBe(true)
    expect(requiresDanmakuLayoutReset(base, { ...base, laneGap: 20 })).toBe(true)
  })

  it('wAAPI 持续时间重基准保留当前运动进度和待入屏延迟', () => {
    const updateTiming = vi.fn()
    const running = {
      currentTime: 4_080,
      effect: { getTiming: () => ({ delay: 80 }), updateTiming },
    } as unknown as Animation
    expect(rebaseAnimationDuration(running, 8, 12)).toBe(true)
    expect(running.currentTime).toBe(6_080)
    expect(updateTiming).toHaveBeenCalledWith({ duration: 12_000 })

    const pending = {
      currentTime: 40,
      effect: { getTiming: () => ({ delay: 80 }), updateTiming: vi.fn() },
    } as unknown as Animation
    rebaseAnimationDuration(pending, 8, 12)
    expect(pending.currentTime).toBe(40)
  })

  it('控制器位置变化不进入弹幕 renderer 配置订阅', () => {
    const contextSource = readFileSync(new URL('../danmaku/context.tsx', import.meta.url), 'utf8')
    expect(contextSource).not.toContain('}, [settings])')
    expect(contextSource).not.toContain('settings.controllerPosition')
    expect(contextSource).toContain('danmakuMaxOnScreen,')
    expect(contextSource).toContain('enableDanmakuHoverPause,')
  })

  it('控制器空白区域可以拖动，交互控件不会触发拖动', () => {
    expect(canStartControllerDrag({ closest: () => null } as unknown as EventTarget)).toBe(true)
    expect(canStartControllerDrag({ closest: () => ({}) } as unknown as EventTarget)).toBe(false)
  })

  it('音量拖动按指针位置计算并稳定限制在合法范围', () => {
    expect(volumeFromPointer(150, 100, 100)).toBe(0.5)
    expect(volumeFromPointer(50, 100, 100)).toBe(0)
    expect(volumeFromPointer(250, 100, 100)).toBe(1)
    expect(volumeFromPointer(150, 100, 0)).toBe(0)
  })

  it('时间轴悬停时间按指针位置计算并限制在视频时长内', () => {
    expect(timelineTimeFromPointer(150, 100, 200, 120)).toBe(30)
    expect(timelineTimeFromPointer(50, 100, 200, 120)).toBe(0)
    expect(timelineTimeFromPointer(350, 100, 200, 120)).toBe(120)
    expect(timelineTimeFromPointer(150, 100, 0, 120)).toBe(0)
  })

  it('回放隔离高频画面层但保留播放器交互外壳', () => {
    const shellSource = readFileSync(
      new URL('../../../components/modules/player/shell/PlayerShell.tsx', import.meta.url),
      'utf8',
    )
    const danmakuSource = readFileSync(
      new URL('../danmaku/NativeDanmakuSurface.tsx', import.meta.url),
      'utf8',
    )
    const timelineSource = readFileSync(
      new URL('../../../components/modules/player/controls/TimelineScrubber.tsx', import.meta.url),
      'utf8',
    )

    expect(shellSource.match(/data-telemetry-replay-block/g)).toHaveLength(3)
    expect(danmakuSource).toContain('data-telemetry-replay-block')
    expect(timelineSource).toContain('data-timeline-track\n        data-telemetry-replay-block')
    expect(timelineSource).not.toContain('role="slider"\n      data-telemetry-replay-block')
  })

  it('统一设置面板打开目标标签，关闭时保留标签供下次恢复', () => {
    const opened = openPlayerSettingsPanel(initialPlayerSettingsPanelState, 'subtitle')
    expect(opened).toEqual({ open: true, section: 'subtitle' })
    expect(closePlayerSettingsPanel(opened)).toEqual({ open: false, section: 'subtitle' })
  })

  it('设置标签由平台能力过滤，不可用目标稳定回退到播放', () => {
    expect(getAvailablePlayerSettingsSections(electronPlayerCapabilities)).toEqual([
      'playback',
      'danmaku',
      'subtitle',
      'playlist',
    ])
    expect(getAvailablePlayerSettingsSections(webPlayerCapabilities)).toEqual([
      'playback',
      'danmaku',
      'subtitle',
    ])
    expect(normalizePlayerSettingsSection('playlist', webPlayerCapabilities)).toBe('playback')

    const minimalCapabilities = {
      ...webPlayerCapabilities,
      externalSubtitle: false,
      domFullscreen: false,
    }
    expect(getAvailablePlayerSettingsSections(minimalCapabilities)).toEqual(['playback', 'danmaku'])
    expect(normalizePlayerSettingsSection('subtitle', minimalCapabilities)).toBe('playback')
  })

  it('播放器设置只保留 backdrop-filter 技术降级，不响应减少透明度偏好', () => {
    const playerCss = readFileSync(new URL('../../../styles/player.css', import.meta.url), 'utf8')
    expect(playerCss).not.toContain('prefers-reduced-transparency')
    expect(playerCss).toContain('@supports not (backdrop-filter: blur(1px))')
    expect(playerCss).toContain('--player-settings-panel: rgb(30 30 35 / 82%)')
  })

  it('设置侧栏只有根表面使用单层背景模糊', () => {
    const panelSource = readFileSync(
      new URL(
        '../../../components/modules/player/setting/PlayerSettingsPanel.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(panelSource.match(/backdrop-blur/g)).toHaveLength(1)
    expect(panelSource.match(/backdrop-saturate/g)).toHaveLength(1)
    expect(panelSource.match(/no-drag-region/g)?.length).toBeGreaterThanOrEqual(4)

    const windowChromeSource = readFileSync(
      new URL('../../../components/modules/player/shell/PlayerWindowChrome.tsx', import.meta.url),
      'utf8',
    )
    expect(windowChromeSource).toContain(
      "right: settingsPanelOpen ? 'var(--player-settings-width)' : 0",
    )
  })

  it('播放列表的长文件名不会撑开侧栏内容宽度', () => {
    const playlistSource = readFileSync(
      new URL(
        '../../../components/modules/player/setting/items/playList/PlayList.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(playlistSource).toContain('max-w-full min-w-0 space-y-3 overflow-hidden')
    expect(playlistSource).toContain('min-w-0 flex-1 truncate')
    expect(playlistSource).toContain('shrink-0 text-xs')
  })
})
