import type { Frame, Runtime } from '../hevc-runtime'
import { EncodedPacket } from 'mediabunny'
import { beforeEach, expect, it, vi } from 'vitest'
import { createHevcDecoder } from '../hevc-decoder'
import { loadHevcRuntime } from '../hevc-runtime'

vi.mock('../hevc-runtime', () => ({ loadHevcRuntime: vi.fn() }))
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const runtime: Runtime = {
  libavjsMemoryStats: vi.fn(),
  ff_init_decoder: vi.fn(),
  ff_decode_multi: vi.fn(),
  ff_free_decoder: vi.fn(),
  terminate: vi.fn(),
}
const packet = new EncodedPacket(new Uint8Array([1]), 'key', 0, 1 / 24)
const create = () => {
  const Decoder = createHevcDecoder({ assetBase: '/assets', threads: 1, shouldDecode: () => true })
  const decoder = new Decoder()
  Object.assign(decoder, {
    config: { codec: 'hvc1.1.6.L93.B0', codedWidth: 2, codedHeight: 2 },
    onSample: vi.fn(),
  })
  return decoder
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadHevcRuntime).mockResolvedValue(runtime)
  vi.mocked(runtime.ff_init_decoder).mockResolvedValue([1, 2, 3, 4])
  vi.mocked(runtime.ff_decode_multi).mockResolvedValue([])
  vi.mocked(runtime.ff_free_decoder).mockResolvedValue()
})
it('原生支持的配置不匹配自定义软解器', () => {
  const Decoder = createHevcDecoder({ assetBase: '/assets', threads: 1, shouldDecode: () => false })
  expect(Decoder.supports('hevc', { codec: 'hvc1.1.6.L93.B0' })).toBe(false)
  expect(loadHevcRuntime).not.toHaveBeenCalled()
})
it('加载过程中关闭，等待运行时返回后只终止一次', async () => {
  const loading = deferred<Runtime>()
  vi.mocked(loadHevcRuntime).mockReturnValue(loading.promise)
  const decoder = create()
  const init = decoder.init()
  await vi.waitFor(() => expect(loadHevcRuntime).toHaveBeenCalled())
  const close = decoder.close()
  expect(decoder.close()).toBe(close)
  loading.resolve(runtime)
  await Promise.all([init, close])
  expect(runtime.ff_init_decoder).not.toHaveBeenCalled()
  expect(runtime.terminate).toHaveBeenCalledTimes(1)
})
it('初始化中关闭，拿到句柄后释放，不提前终止 WASM', async () => {
  const opening = deferred<[number, number, number, number]>()
  vi.mocked(runtime.ff_init_decoder).mockReturnValue(opening.promise)
  const decoder = create()
  const init = decoder.init()
  await vi.waitFor(() => expect(runtime.ff_init_decoder).toHaveBeenCalled())
  const close = decoder.close()
  expect(runtime.terminate).not.toHaveBeenCalled()
  opening.resolve([1, 2, 3, 4])
  await Promise.all([init, close])
  expect(runtime.ff_free_decoder).toHaveBeenCalledWith(2, 3, 4)
  expect(runtime.terminate).toHaveBeenCalledTimes(1)
})
it('解码中关闭不发布迟到帧，也不执行排队的新解码', async () => {
  const decoding = deferred<Frame[]>()
  vi.mocked(runtime.ff_decode_multi).mockReturnValue(decoding.promise)
  const decoder = create()
  await decoder.init()
  const first = decoder.decode(packet)
  await vi.waitFor(() => expect(runtime.ff_decode_multi).toHaveBeenCalled())
  const second = decoder.decode(packet)
  const close = decoder.close()
  expect(runtime.ff_free_decoder).not.toHaveBeenCalled()
  // 已关闭时根本不应读取返回帧的字段。
  decoding.resolve([
    new Proxy({} as Frame, {
      get() {
        throw new Error('读取了迟到帧')
      },
    }),
  ])
  await Promise.all([first, second, close])
  expect(decoder.onSample).not.toHaveBeenCalled()
  expect(runtime.ff_decode_multi).toHaveBeenCalledTimes(1)
  expect(runtime.terminate).toHaveBeenCalledTimes(1)
})
it('解码错误后仍可关闭且不再次调用解码器', async () => {
  const decoder = create()
  await decoder.init()
  vi.mocked(runtime.ff_decode_multi).mockRejectedValue(new Error('损坏码流'))
  await expect(decoder.decode(packet)).rejects.toThrow('损坏码流')
  await expect(decoder.flush()).rejects.toThrow('损坏码流')
  await decoder.close()
  expect(runtime.ff_free_decoder).toHaveBeenCalledTimes(1)
  expect(runtime.terminate).toHaveBeenCalledTimes(1)
})
