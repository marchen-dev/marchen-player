import type { FullscreenSnapshot } from '../platform/ports'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { electronPlayerCapabilities, webPlayerCapabilities } from '../platform/capabilities'
import { resolvePlayerControlAvailability } from '../platform/control-availability'
import { createBrowserFullscreenPort } from '../platform/web'

describe('player platform ports', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('按 Web 与 Electron 能力生成不同的控制器分支', () => {
    expect(resolvePlayerControlAvailability(webPlayerCapabilities)).toEqual({
      transport: 'playlist',
      playlist: true,
      embeddedSubtitle: true,
      externalSubtitle: true,
      fullscreen: true,
    })
    expect(resolvePlayerControlAvailability(electronPlayerCapabilities)).toEqual({
      transport: 'playlist',
      playlist: true,
      embeddedSubtitle: true,
      externalSubtitle: true,
      fullscreen: true,
    })
  })

  it('browser Fullscreen Port 根据外部 fullscreenchange 同步状态', async () => {
    const events = new EventTarget()
    const documentMock = {
      fullscreenElement: null as HTMLElement | null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      exitFullscreen: vi.fn(async () => {
        documentMock.fullscreenElement = null
        events.dispatchEvent(new Event('fullscreenchange'))
      }),
    }
    const root = {
      requestFullscreen: vi.fn(async () => {
        documentMock.fullscreenElement = root as HTMLElement
        events.dispatchEvent(new Event('fullscreenchange'))
      }),
    } as unknown as HTMLElement
    vi.stubGlobal('document', documentMock)

    const port = createBrowserFullscreenPort()
    const snapshots: FullscreenSnapshot[] = []
    const unsubscribe = port.subscribe((snapshot) => snapshots.push(snapshot))
    await port.enter(root)
    await port.exit()
    unsubscribe()

    expect(snapshots).toEqual([
      { active: true, mode: 'dom' },
      { active: false, mode: 'dom' },
    ])
    expect(port.getSnapshot()).toEqual({ active: false, mode: 'dom' })
  })
})
