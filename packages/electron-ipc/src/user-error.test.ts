import { isUserError, UserError } from '@marchen/shared/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerIpc } from './main'
import { createClient } from './renderer'

type Handler = (event: { sender: unknown }, payload: unknown) => Promise<unknown>
const handlers = vi.hoisted(() => new Map<string, Handler>())
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
}))

/** 模拟 Electron 的进程间调用：主进程抛出的错误只有文字能到达页面，并被加上固定前缀 */
const ipcInvoke = async (channel: string, payload: unknown) => {
  try {
    return await handlers.get(channel)!({ sender: {} }, payload)
  } catch (error) {
    const original = error as Error
    throw new Error(
      `Error invoking remote method '${channel}': ${original.name}: ${original.message}`,
    )
  }
}

const router = {
  demo: {
    ok: { action: async ({ input }: { input: unknown }) => ({ echoed: input }) },
    userError: {
      action: async () => {
        throw new UserError('danmakuLink.http', '接口返回 503', { status: 503 })
      },
    },
    plainError: {
      action: async () => {
        throw new Error('文件不存在')
      },
    },
    syncThrow: {
      action: () => {
        throw new UserError('a.b', '同步抛出')
      },
    },
  },
}
const client = createClient<any>({ ipcInvoke })

beforeEach(() => {
  handlers.clear()
  registerIpc(router as any)
})

describe('进程间调用里的用户错误', () => {
  it('正常返回不受影响', async () => {
    await expect(client.demo.ok({ a: 1 })).resolves.toEqual({ echoed: { a: 1 } })
  })

  it('用户错误到达页面后仍带错误码、参数与中文说明', async () => {
    const error = await client.demo.userError(undefined).catch((cause: unknown) => cause)
    expect(isUserError(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'danmakuLink.http',
      params: { status: 503 },
      message: '接口返回 503',
    })
  })

  it('同步抛出的用户错误同样处理', async () => {
    await expect(client.demo.syncThrow(undefined)).rejects.toMatchObject({
      code: 'a.b',
      message: '同步抛出',
    })
  })

  it('普通错误保持 Electron 原来的形式', async () => {
    const error = await client.demo.plainError(undefined).catch((cause: unknown) => cause)
    expect(isUserError(error)).toBe(false)
    expect((error as Error).message).toBe(
      "Error invoking remote method 'demo:plainError': Error: 文件不存在",
    )
  })
})
