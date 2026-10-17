import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ exit: vi.fn() }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.2.3', exit: mocks.exit } }))

const { attachSmokeTest } = await import('./smoke-test')

/** counts 依次作为每次探测到的根节点子元素数，用完后保持最后一个值 */
function fakeWindow(counts: number[] | Error) {
  const events = new Map<string, (...args: unknown[]) => void>()
  let call = 0
  const window = {
    isDestroyed: () => false,
    webContents: {
      on: (name: string, callback: (...args: unknown[]) => void) => events.set(name, callback),
      once: (name: string, callback: (...args: unknown[]) => void) => events.set(name, callback),
      executeJavaScript: () => {
        if (counts instanceof Error) return Promise.reject(counts)
        const count = counts[Math.min(call++, counts.length - 1)]
        return Promise.resolve(JSON.stringify({ count, marks: ['marchen:startup-start'] }))
      },
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
    const { window, events } = fakeWindow([1])
    attachSmokeTest(window, '')
    expect(events.size).toBe(0)
  })
  it('首屏较慢时持续轮询，渲染并稳定后以 0 退出', async () => {
    const marker = join(dir, 'ok.json')
    // 前 10 秒根节点为空，模拟 CI 软件渲染下的慢启动
    const { window, events } = fakeWindow([...Array.from<number>({ length: 20 }).fill(0), 1])
    attachSmokeTest(window, marker)
    events.get('did-finish-load')!()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.exit).toHaveBeenCalledWith(0)
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({
      ok: true,
      version: '1.2.3',
      firstRenderMs: expect.any(Number),
    })
  })
  it('超时未渲染时以 1 退出并带回控制台错误与启动标记', async () => {
    const marker = join(dir, 'empty.json')
    const { window, events } = fakeWindow([0])
    attachSmokeTest(window, marker)
    events.get('console-message')!({
      level: 'error',
      message: 'boom',
      sourceId: 'index.js',
      lineNumber: 1,
    })
    events.get('console-message')!({ level: 'info', message: 'ignored' })
    events.get('did-finish-load')!()
    await vi.advanceTimersByTimeAsync(31_000)
    expect(mocks.exit).toHaveBeenLastCalledWith(1)
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({
      ok: false,
      reason: 'root_not_rendered',
      marks: ['marchen:startup-start'],
      consoleErrors: ['boom (index.js:1)'],
    })
  })
  it('渲染进程退出时立即以 1 退出', async () => {
    const marker = join(dir, 'gone.json')
    const { window, events } = fakeWindow([1])
    attachSmokeTest(window, marker)
    events.get('render-process-gone')!({}, { reason: 'crashed' })
    expect(mocks.exit).toHaveBeenLastCalledWith(1)
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({
      ok: false,
      detail: 'crashed',
    })
  })
})
