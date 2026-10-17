import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ exit: vi.fn() }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.2.3', exit: mocks.exit } }))

const { attachSmokeTest } = await import('./smoke-test')

function fakeWindow(count: number | Error) {
  const events = new Map<string, (...args: unknown[]) => void>()
  const window = {
    isDestroyed: () => false,
    webContents: {
      on: (name: string, callback: (...args: unknown[]) => void) => events.set(name, callback),
      once: (name: string, callback: (...args: unknown[]) => void) => events.set(name, callback),
      executeJavaScript: () =>
        count instanceof Error ? Promise.reject(count) : Promise.resolve(count),
    },
  }
  return { window: window as never, events }
}

let dir: string
beforeEach(async () => {
  vi.useFakeTimers()
  mocks.exit.mockReset()
  dir = await mkdtemp(join(tmpdir(), 'marchen-smoke-'))
})
afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

describe('发行冒烟开关', () => {
  it('未设置标记路径时不注册任何监听', () => {
    const { window, events } = fakeWindow(1)
    attachSmokeTest(window, '')
    expect(events.size).toBe(0)
  })
  it('页面渲染完成后写出成功标记并以 0 退出', async () => {
    const marker = join(dir, 'ok.json')
    const { window, events } = fakeWindow(1)
    attachSmokeTest(window, marker)
    events.get('did-finish-load')!()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.exit).toHaveBeenCalledWith(0)
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({ ok: true, version: '1.2.3' })
  })
  it('根节点为空或渲染进程退出时以 1 退出', async () => {
    const empty = fakeWindow(0)
    attachSmokeTest(empty.window, join(dir, 'empty.json'))
    empty.events.get('did-finish-load')!()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.exit).toHaveBeenLastCalledWith(1)
    const gone = fakeWindow(1)
    const marker = join(dir, 'gone.json')
    attachSmokeTest(gone.window, marker)
    gone.events.get('render-process-gone')!({}, { reason: 'crashed' })
    expect(mocks.exit).toHaveBeenLastCalledWith(1)
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({
      ok: false,
      detail: 'crashed',
    })
  })
})
