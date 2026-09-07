// 真实 WASM 重建/取消测试；记录终止调用，不能把该计数解释为同步 GC。
const workers = new Set()
const NativeWorker = globalThis.Worker
globalThis.Worker = class extends NativeWorker {
  constructor(...args) {
    super(...args)
    workers.add(this)
  }
  terminate() {
    super.terminate()
    workers.delete(this)
  }
}
globalThis.onmessage = async ({ data }) => {
  let decoder
  try {
    const { createHevcDecoder } = await import('/adapter.mjs')
    const fixture = await (await fetch('/fixture.json')).json()
    const packets = fixture.packets.map((packet) => ({
      ...packet,
      data: Uint8Array.from(atob(packet.data), (value) => value.charCodeAt(0)),
    }))
    const Decoder = createHevcDecoder({
      assetBase: `${globalThis.location.origin}/dist`,
      threads: data.threads,
      shouldDecode: () => true,
    })
    let samples = 0
    const create = () =>
      Object.assign(new Decoder(), {
        config: { ...fixture.config, description: new Uint8Array(fixture.config.description) },
        onSample(sample) {
          samples++
          sample.close()
        },
      })
    decoder = create()
    const initializing = decoder.init()
    await Promise.all([initializing, decoder.close()])
    const rounds = []
    for (let round = 0; round < 3; round++) {
      decoder = create()
      await decoder.init()
      // 模拟 seek 的丢弃旧 decoder / 从关键帧重建，依次前进、回退、再前进时间线。
      const shift = [5000, -60, 0][round]
      const before = samples
      for (const packet of packets.slice(0, 30))
        await decoder.decode({ ...packet, timestamp: packet.timestamp + shift })
      const pending = decoder.decode({ ...packets[30], timestamp: packets[30].timestamp + shift })
      await new Promise((resolve) => setTimeout(resolve, 0))
      const atClose = samples
      await Promise.all([pending, decoder.close(), decoder.close()])
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (samples !== atClose) throw new Error('关闭后发布了迟到帧')
      if (workers.size) throw new Error('关闭后存在未终止 Worker')
      if (samples === before) throw new Error('重建后未实际输出画面')
      rounds.push({ frames: samples - before, unterminatedWorkers: workers.size })
    }
    postMessage({ rounds, samples })
  } catch (error) {
    try {
      await decoder?.close()
    } catch {
      /* 保留原始失败 */
    }
    postMessage({ error: String(error) })
  }
}
