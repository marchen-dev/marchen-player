// 有节奏的短测：复用实际解码器和绘制候选，统计 GPU 完成；不冒充屏幕扫描输出或音画验收。
globalThis.onmessage = async ({ data }) => {
  let decoder, renderer
  const pending = []
  try {
    const { createHevcDecoder, HdrSdrRenderer } = await import('/adapter.mjs')
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
    decoder = new Decoder()
    let peakPending = 0
    Object.assign(decoder, {
      config: { ...fixture.config, description: new Uint8Array(fixture.config.description) },
      onSample(sample) {
        pending.push(sample)
        peakPending = Math.max(peakPending, pending.length)
      },
    })
    const started = performance.now()
    await decoder.init()
    const initMs = performance.now() - started
    let canvas, context, staging, anchor, firstTimestamp, firstFrameMs, lastPresented
    let rendered = 0
    let dropped = 0
    let decodeMs = 0
    let peakStagingBytes = 0
    const drawTimes = []
    async function consume() {
      while (pending.length) {
        const sample = pending.shift()
        try {
          if (anchor !== undefined) {
            const target = anchor + (sample.timestamp - firstTimestamp) * 1000
            if (performance.now() - target > sample.duration * 1000) {
              dropped++
              continue
            }
            const delay = target - performance.now()
            if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
          }
          const begin = performance.now()
          if (!canvas) {
            canvas = new OffscreenCanvas(sample.codedWidth, sample.codedHeight)
            if (['pq', 'hlg'].includes(sample.colorSpace.transfer))
              renderer = new HdrSdrRenderer(canvas)
            else context = canvas.getContext('2d')
          }
          if (renderer) {
            const size = sample.allocationSize()
            if (!staging || staging.byteLength < size) staging = new Uint8Array(size)
            peakStagingBytes = Math.max(peakStagingBytes, size)
            const layout = await sample.copyTo(staging)
            renderer.draw({
              data: staging,
              layout,
              width: sample.codedWidth,
              height: sample.codedHeight,
              bitDepth: sample.format === 'I420P10' ? 10 : 8,
              colorSpace: sample.colorSpace,
            })
            // 测试等待GPU完成，生产路径不应逐帧强制同步。
            canvas.getContext('webgl2').finish()
          } else {
            sample.draw(context, 0, 0, canvas.width, canvas.height)
          }
          drawTimes.push(performance.now() - begin)
          rendered++
          lastPresented = performance.now()
          if (anchor === undefined) {
            anchor = lastPresented
            firstTimestamp = sample.timestamp
            firstFrameMs = lastPresented - started
          }
        } finally {
          sample.close()
        }
      }
    }
    for (const packet of packets) {
      const begin = performance.now()
      await decoder.decode(packet)
      decodeMs += performance.now() - begin
      await consume()
    }
    const begin = performance.now()
    await decoder.flush()
    decodeMs += performance.now() - begin
    await consume()
    const diagnostics = decoder.getDiagnostics()
    await decoder.close()
    renderer?.close()
    drawTimes.sort((a, b) => a - b)
    postMessage({
      threads: data.threads,
      frames: packets.length,
      rendered,
      dropped,
      initMs,
      firstFrameMs,
      decodeMs,
      drawP95Ms: drawTimes[Math.floor(drawTimes.length * 0.95)],
      pacedFps: ((rendered - 1) * 1000) / (lastPresented - anchor),
      peakPending,
      peakStagingBytes,
      diagnostics,
    })
  } catch (error) {
    for (const sample of pending) sample.close()
    try {
      await decoder?.close()
    } catch {
      /* 保留原始错误 */
    }
    renderer?.close()
    postMessage({ error: String(error) })
  }
}
