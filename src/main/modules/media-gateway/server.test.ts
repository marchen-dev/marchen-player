import { describe, expect, it } from 'vitest'
import { MediaGatewayServer } from './server'

describe('mediaGatewayServer', () => {
  it('只绑定 127.0.0.1 随机端口，并支持幂等启停', async () => {
    const gateway = new MediaGatewayServer()
    const firstUrl = await gateway.start()
    const secondUrl = await gateway.start()

    expect(firstUrl).toBe(secondUrl)
    expect(new URL(firstUrl).hostname).toBe('127.0.0.1')
    expect(Number(new URL(firstUrl).port)).toBeGreaterThan(0)
    await expect(fetch(`${firstUrl}/missing`)).resolves.toMatchObject({ status: 404 })

    await gateway.stop()
    await gateway.stop()
    await expect(fetch(`${firstUrl}/missing`)).rejects.toThrow()
  })
})
