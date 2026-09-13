export async function run({ fixture, view }) {
  const worker = new Worker('/worker.mjs', { type: 'module' })
  const decoded = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('软解超时')), 30000)
    worker.onmessage = ({ data }) => {
      clearTimeout(timer)
      data.error ? reject(new Error(data.error)) : resolve(data)
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      reject(new Error(e.message))
    }
    worker.postMessage(fixture)
  }).finally(() => worker.terminate())
  const { createPlanarHdrRenderer } = await import('/renderer.mjs')
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const renderer = await createPlanarHdrRenderer(canvas)
  const values = await renderer.draw(decoded.first, true)
  const presentation = renderer.diagnostics()
  const y = decoded.first.layout[0]
  const yuv = Array.from({ length: 4 }, (_, i) =>
    decoded.first.layout.map((plane, j) =>
      new DataView(decoded.first.data.buffer).getUint16(
        plane.offset +
          Math.floor(decoded.first.height / (j ? 4 : 2)) * plane.stride +
          Math.floor(((i + 0.5) * decoded.first.width) / (j ? 8 : 4)) * 2,
        true,
      ),
    ),
  )
  const codes = Array.from({ length: 4 }, (_, i) =>
    new DataView(decoded.first.data.buffer).getUint16(
      y.offset +
        Math.floor(decoded.first.height / 2) * y.stride +
        Math.floor(((i + 0.5) * decoded.first.width) / 4) * 2,
      true,
    ),
  )
  let sdrPresentation, sdrValues, matchedValues
  if (view) {
    canvas.before(
      Object.assign(document.createElement('p'), {
        textContent:
          '上方：HDR 扩展输出（100 / 203 / 400 / 1000 nit 输入）；下方：shader 明确限制到 SDR 白（最大值 1）。比较右半部分；不要求达到标称 nit。',
      }),
    )
    const sdr = document.createElement('canvas')
    document.body.append(sdr)
    const sdrRenderer = await createPlanarHdrRenderer(sdr, 'standard', true)
    sdrValues = await sdrRenderer.draw(decoded.first, true)
    sdrPresentation = sdrRenderer.diagnostics()
    // 比较时保持面积和缩放一致，不能把大条带与小高光的观感直接等同。
    canvas.style.cssText = 'width:256px;height:64px;margin:16px 0'
    sdr.style.cssText = canvas.style.cssText
    const matched = document.createElement('section')
    matched.style.cssText = 'margin:24px 0;padding:16px;border:1px solid #777'
    const caption = document.createElement('p')
    caption.textContent =
      '同尺寸对照：左=SDR 白，中=视频解码的最右高光，右=与视频数值相同的纯色 HDR。先比较中与右，再比较它们与左。'
    matched.append(caption)
    const matchedRow = document.createElement('div')
    matchedRow.style.cssText = 'display:flex;gap:32px;align-items:center'
    matched.append(matchedRow)
    canvas.before(matched)
    const reference = document.createElement('div')
    reference.style.cssText = 'width:64px;height:64px;background:white;flex:none'
    matchedRow.append(reference)
    const tileCanvas = document.createElement('canvas')
    tileCanvas.style.cssText = 'width:64px;height:64px;margin:0'
    matchedRow.append(tileCanvas)
    const tileData = new Uint8Array(64 * 64 * 3)
    const tileLayout = [
      { offset: 0, stride: 128 },
      { offset: 8192, stride: 64 },
      { offset: 10240, stride: 64 },
    ]
    // 取实际解码平面的右侧区域；不以构造颜色替代视频输入。
    for (let plane = 0; plane < 3; plane++) {
      const dimension = plane ? 32 : 64,
        source = decoded.first.layout[plane],
        target = tileLayout[plane]
      const sourceWidth = plane ? Math.ceil(decoded.first.width / 2) : decoded.first.width
      const sourceHeight = plane ? Math.ceil(decoded.first.height / 2) : decoded.first.height
      for (let row = 0; row < dimension; row++)
        for (let col = 0; col < dimension; col++) {
          const x = Math.min(
            sourceWidth - 1,
            Math.floor(sourceWidth * 0.75 + (col * sourceWidth) / 4 / dimension),
          )
          const y = Math.min(sourceHeight - 1, Math.floor((row * sourceHeight) / dimension))
          tileData.set(
            decoded.first.data.subarray(
              source.offset + y * source.stride + x * 2,
              source.offset + y * source.stride + x * 2 + 2,
            ),
            target.offset + row * target.stride + col * 2,
          )
        }
    }
    const tileRenderer = await createPlanarHdrRenderer(tileCanvas)
    matchedValues = await tileRenderer.draw(
      { ...decoded.first, width: 64, height: 64, layout: tileLayout, data: tileData },
      true,
    )
    const clearCanvas = document.createElement('canvas')
    clearCanvas.width = 64
    clearCanvas.height = 64
    clearCanvas.style.cssText = 'width:64px;height:64px;margin:0'
    matchedRow.append(clearCanvas)
    const clearDevice = await (await navigator.gpu.requestAdapter()).requestDevice()
    const clearContext = clearCanvas.getContext('webgpu')
    clearContext.configure({
      device: clearDevice,
      format: 'rgba16float',
      colorSpace: 'srgb',
      toneMapping: { mode: 'extended' },
    })
    const commands = clearDevice.createCommandEncoder()
    const [r, g, b] = matchedValues[0]
    const clearPass = commands.beginRenderPass({
      colorAttachments: [
        {
          view: clearContext.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [r, g, b, 1],
        },
      ],
    })
    clearPass.end()
    clearDevice.queue.submit([commands.finish()])
    window.addEventListener(
      'pagehide',
      () => {
        tileRenderer.close()
        clearContext.unconfigure()
        clearDevice.destroy()
      },
      { once: true },
    )
    const heading = document.createElement('p')
    heading.textContent =
      '独立纯色对照：左为 CSS 白，中为 standard 画布写入 2，右为 extended 画布写入 2。此排不经过视频解码和色彩 shader。'
    document.body.append(heading)
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:24px;align-items:center'
    document.body.append(row)
    const white = document.createElement('div')
    white.style.cssText = 'width:100px;height:100px;background:white;flex:none'
    row.append(white)
    const probeDevice = await (await navigator.gpu.requestAdapter()).requestDevice()
    const configs = []
    for (const mode of ['standard', 'extended']) {
      const probe = document.createElement('canvas')
      probe.width = 100
      probe.height = 100
      probe.style.cssText = 'width:100px;height:100px;margin:0'
      row.append(probe)
      const ctx = probe.getContext('webgpu')
      ctx.configure({
        device: probeDevice,
        format: 'rgba16float',
        colorSpace: 'srgb',
        toneMapping: { mode },
      })
      const encoder = probeDevice.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [2, 2, 2, 1],
          },
        ],
      })
      pass.end()
      probeDevice.queue.submit([encoder.finish()])
      configs.push(ctx)
    }
    window.addEventListener(
      'pagehide',
      () => {
        for (const ctx of configs) ctx.unconfigure()
        probeDevice.destroy()
      },
      { once: true },
    )
    window.addEventListener(
      'pagehide',
      () => {
        renderer.close()
        sdrRenderer.close()
      },
      { once: true },
    )
  } else renderer.close()
  return {
    presentation,
    sdrPresentation,
    sdrValues,
    matchedValues,
    format: decoded.first.format,
    colorSpace: decoded.first.colorSpace,
    yuv,
    codes,
    values,
    frames: decoded.frames,
    decodeElapsedMs: decoded.elapsedMs,
    hdr: matchMedia('(dynamic-range: high)').matches,
    userAgent: navigator.userAgent,
  }
}
const status = document.getElementById('status')
window.hdrReady = fetch('/fixture.json')
  .then((response) => {
    if (!response.ok) throw new Error('无法读取测试数据')
    return response.json()
  })
  .then((fixture) => run({ fixture, view: true }))
  .then((result) => {
    status.textContent = '同尺寸对照已就绪：框内左为 SDR 白，中为实际解码高光，右为同值 HDR 纯色。'
    status.dataset.state = 'ready'
    return result
  })
  .catch((error) => {
    status.textContent = '测试失败：' + String(error)
    status.dataset.state = 'error'
    return { error: String(error) }
  })
