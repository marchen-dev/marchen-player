import { beforeEach, expect, it, vi } from 'vitest'
import { fileOpenRequests } from './file-open-requests'
import { acquireSingleInstance } from './single-instance'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  lock: vi.fn(),
  quit: vi.fn(),
  env: { isDev: false, isMacOS: false },
}))
vi.mock('electron', () => ({ app: {
  on: mocks.on,
  requestSingleInstanceLock: mocks.lock,
  quit: mocks.quit,
} }))
vi.mock('./env', () => mocks.env)
vi.mock('./file-open-requests', () => ({ fileOpenRequests: {
  activateWindow: vi.fn(),
  requestFromArgv: vi.fn(),
} }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.isDev = false
  mocks.env.isMacOS = false
  vi.unstubAllEnvs()
})

it('没有锁时退出并阻止后续启动', () => {
  mocks.lock.mockReturnValue(false)
  expect(acquireSingleInstance()).toBe(false)
  expect(mocks.quit).toHaveBeenCalledOnce()
})

it('持锁实例唤醒已有窗口并转交 Windows 文件参数', () => {
  mocks.lock.mockReturnValue(true)
  expect(acquireSingleInstance()).toBe(true)
  expect(mocks.quit).not.toHaveBeenCalled()
  expect(mocks.on.mock.invocationCallOrder[0]).toBeLessThan(mocks.lock.mock.invocationCallOrder[0])
  const argv = ['Marchen.exe', 'C:\\动画 目录\\第一集.mkv']
  mocks.on.mock.calls[0][1]({}, argv)
  expect(fileOpenRequests.activateWindow).toHaveBeenCalledOnce()
  expect(fileOpenRequests.requestFromArgv).toHaveBeenCalledWith(argv)
})

it('仅开发环境可以显式允许多实例', () => {
  vi.stubEnv('MARCHEN_ALLOW_MULTIPLE_INSTANCES', '1')
  mocks.lock.mockReturnValue(false)
  expect(acquireSingleInstance()).toBe(false)
  mocks.env.isDev = true
  mocks.lock.mockClear()
  expect(acquireSingleInstance()).toBe(true)
  expect(mocks.lock).not.toHaveBeenCalled()
})
