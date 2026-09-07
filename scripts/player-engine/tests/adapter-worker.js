// 同一模块由后续媒体 Worker 复用；这里显式强制软解以免硬件能力掩盖结果。
globalThis.onmessage = async ({ data }) => {
  let decoder
  let renderer
  let rendered = 0
  try {
    const { createHevcDecoder, HdrSdrRenderer } = await import('/adapter.mjs')
    const fixture = await (await fetch('/fixture.json')).json()
    const description = new Uint8Array(fixture.config.description)
    const lengthSize = (description[21] & 3) + 1
    const headers = []
    if (data.annexB) {
      let offset = 23
      for (let array = 0; array < description[22]; array++) {
        offset++
        const count = description[offset++] * 256 + description[offset++]
        for (let nal = 0; nal < count; nal++) {
          const size = description[offset++] * 256 + description[offset++]
          headers.push(0, 0, 0, 1, ...description.subarray(offset, offset + size))
          offset += size
        }
      }
    }
    const Decoder = createHevcDecoder({
      assetBase: `${globalThis.location.origin}/dist`,
      threads: data.threads,
      shouldDecode: () => true,
    })
    decoder = new Decoder()
    const hashes = []
    const timestamps = []
    const durations = []
    Object.assign(decoder, {
      config: { ...fixture.config, description: data.annexB ? undefined : description },
      onSample(sample) {
        timestamps.push(sample.timestamp)
        durations.push(sample.duration)
        const bytes = new Uint8Array(sample.allocationSize())
        hashes.push(
          (async () => {
            try {
              const layout = await sample.copyTo(bytes)
              if (data.render && rendered === 0) {
                const canvas = new OffscreenCanvas(sample.codedWidth, sample.codedHeight)
                renderer = new HdrSdrRenderer(canvas)
                renderer.draw({
                  data: bytes,
                  layout,
                  width: sample.codedWidth,
                  height: sample.codedHeight,
                  bitDepth: sample.format === 'I420P10' ? 10 : 8,
                  colorSpace: sample.colorSpace,
                })
                const gl = canvas.getContext('webgl2')
                const pixel = new Uint8Array(4)
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
                if (gl.getError() !== gl.NO_ERROR) throw new Error('真实视频帧 GPU 绘制错误')
                rendered++
                renderer.close()
              }
              return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
                x.toString(16).padStart(2, '0'),
              ).join('')
            } finally {
              sample.close()
            }
          })(),
        )
      },
    })
    await decoder.init()
    for (const packet of fixture.packets) {
      let bytes = Uint8Array.from(atob(packet.data), (x) => x.charCodeAt(0))
      if (data.annexB) {
        const parts = packet.type === 'key' ? [...headers] : []
        let offset = 0
        while (offset < bytes.length) {
          let size = 0
          for (let byte = 0; byte < lengthSize; byte++) size = size * 256 + bytes[offset++]
          if (!size || offset + size > bytes.length) throw new Error('无效的 NAL 长度')
          parts.push(0, 0, 0, 1)
          for (const value of bytes.subarray(offset, offset + size)) parts.push(value)
          offset += size
        }
        bytes = new Uint8Array(parts)
      }
      await decoder.decode({
        ...packet,
        timestamp: packet.timestamp + (data.shift ?? 0),
        data: bytes,
      })
    }
    await decoder.flush()
    const result = await Promise.all(hashes)
    const diagnostics = decoder.getDiagnostics()
    await decoder.close()
    await decoder.close()
    postMessage({ hashes: result, timestamps, durations, rendered, diagnostics })
  } catch (error) {
    renderer?.close()
    await decoder?.close()
    postMessage({ error: String(error) })
  }
}
