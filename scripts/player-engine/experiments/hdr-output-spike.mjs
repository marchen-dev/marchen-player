import { createServer } from 'node:http'
import { chromium, _electron } from 'playwright-core'
import { open, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Input, CustomSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny'

// 使用真实显示器，不能用 Playwright 默认的强制 sRGB 判断 HDR 能力。
let fixture = null
const filename = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const experimental = process.argv.includes('--experimental')
const colorSpace = process.argv.find((arg) => arg.startsWith('--color='))?.slice(8) ?? 'srgb'
const direct = process.argv.includes('--direct')
const precision = process.argv.includes('--precision')
if (filename) {
  const handle = await open(filename, 'r')
  const stat = await handle.stat()
  const input = new Input({
    formats: ALL_FORMATS,
    source: new CustomSource({
      getSize: () => stat.size,
      read: async (start, end) => {
        const bytes = new Uint8Array(end - start)
        let offset = 0
        while (offset < bytes.length) {
          const result = await handle.read(bytes, offset, bytes.length - offset, start + offset)
          if (!result.bytesRead) throw new Error('媒体读取提前结束')
          offset += result.bytesRead
        }
        return bytes
      },
    }),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    const config = await track.getDecoderConfig()
    const sink = new EncodedPacketSink(track)
    const key = await sink.getKeyPacket(60)
    const packets = []
    for await (const packet of sink.packets(key)) {
      packets.push({
        data: Array.from(packet.data),
        timestamp: Math.round(packet.timestamp * 1e6),
        duration: Math.round(packet.duration * 1e6),
        type: packet.type,
      })
      if (packets.length >= 32) break
    }
    fixture = {
      config: { ...config, description: Array.from(new Uint8Array(config.description)) },
      packets,
    }
  } finally {
    input.dispose()
    await handle.close()
  }
}
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end('<!doctype html><title>HDR 高光保留验证</title>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser, electronApp, tempDir
try {
  let page
  if (process.argv.includes('--electron')) {
    tempDir = await mkdtemp(join(tmpdir(), 'marchen-hdr-'))
    const entry = join(tempDir, 'main.cjs')
    await writeFile(
      entry,
      `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const win=new BrowserWindow({width:1100,height:720,webPreferences:{backgroundThrottling:false}});win.loadURL('about:blank');});`,
    )
    electronApp = await _electron.launch({
      args: [...(experimental ? ['--enable-experimental-web-platform-features'] : []), entry],
    })
    page = await electronApp.firstWindow()
  } else {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      ignoreDefaultArgs: ['--force-color-profile=srgb'],
      args: experimental ? ['--enable-experimental-web-platform-features'] : [],
    })
    const context = await browser.newContext({ viewport: null })
    page = await context.newPage()
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const session = await page.context().newCDPSession(page)
  const decoderProperties = []
  session.on('Media.playerPropertiesChanged', ({ properties }) => {
    decoderProperties.push(...properties.filter(({ name }) => /decoder|platform|codec/i.test(name)))
  })
  await session.send('Media.enable')
  const result = await page.evaluate(
    async ({ fixture, colorSpace, direct, precision }) => {
      const adapter = await navigator.gpu?.requestAdapter()
      if (!adapter) throw new Error('WebGPU adapter 不可用')
      const device = await adapter.requestDevice()
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 128
      document.body.append(canvas)
      const context = canvas.getContext('webgpu')
      context.configure({ device, format: 'rgba16float', toneMapping: { mode: 'extended' } })
      // PQ 灰阶：100、203、400、1000 nit；读取仅用于验证，不属于播放路径。
      const nits = [100, 203, 400, 1000]
      const pq = (n) => {
        const p = (n / 10000) ** (2610 / 16384)
        return ((3424 / 4096 + (2413 / 128) * p) / (1 + (2392 / 128) * p)) ** (2523 / 32)
      }
      const width = 8,
        height = 2
      const data = new Uint16Array(width * height * 1.5)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          data[y * width + x] = precision
            ? 512 + Math.floor(x / 2)
            : Math.round(64 + 876 * pq(nits[Math.floor(x / 2)]))
        }
      data.fill(512, width * height)
      let frame = new VideoFrame(data, {
        format: 'I420P10',
        codedWidth: width,
        codedHeight: height,
        timestamp: 0,
        colorSpace: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false },
      })
      let decoded = null
      if (fixture) {
        frame.close()
        let decodeError = null
        const decoder = new VideoDecoder({
          output: (value) => {
            if (!decoded) decoded = value
            else value.close()
          },
          error: (error) => {
            decodeError = String(error)
          },
        })
        decoder.configure({
          ...fixture.config,
          description: new Uint8Array(fixture.config.description),
          hardwareAcceleration: 'prefer-hardware',
        })
        for (const packet of fixture.packets)
          decoder.decode(new EncodedVideoChunk({ ...packet, data: new Uint8Array(packet.data) }))
        await decoder.flush()
        decoder.close()
        if (!decoded) throw new Error(decodeError || '没有解码帧')
        frame = decoded
      }
      const copyResults = []
      if (fixture)
        for (const format of ['I420P10', 'I420', 'RGBAF16', 'RGBA']) {
          try {
            const start = performance.now()
            const options = { format }
            const buffer = new Uint8Array(frame.allocationSize(options))
            await frame.copyTo(buffer, options)
            copyResults.push({
              format,
              bytes: buffer.byteLength,
              durationMs: performance.now() - start,
            })
          } catch (error) {
            copyResults.push({ format, error: String(error) })
          }
        }
      // 仅在验证中读回上传纹理，检查 WebGL 是否在导入阶段降低精度。
      const glResults = []
      const glCanvas = document.createElement('canvas')
      const gl = glCanvas.getContext('webgl2')
      if (gl && gl.getExtension('EXT_color_buffer_float')) {
        for (const conversion of [gl.NONE, gl.BROWSER_DEFAULT_WEBGL]) {
          const tex = gl.createTexture()
          const fbo = gl.createFramebuffer()
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
          gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, conversion)
          const start = performance.now()
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, frame)
          const uploadError = gl.getError()
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
          const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
          const pixels = new Float32Array(16)
          if (!uploadError && complete) {
            for (let i = 0; i < 4; i++)
              gl.readPixels(
                Math.min(frame.displayWidth - 1, Math.floor(((i + 0.5) * frame.displayWidth) / 4)),
                Math.floor(frame.displayHeight / 2),
                1,
                1,
                gl.RGBA,
                gl.FLOAT,
                pixels.subarray(i * 4, i * 4 + 4),
              )
          }
          glResults.push({
            conversion: conversion === gl.NONE ? 'none' : 'browser-default',
            uploadError,
            complete,
            readError: gl.getError(),
            elapsedMs: performance.now() - start,
            pixels: Array.from(pixels),
          })
          gl.deleteFramebuffer(fbo)
          gl.deleteTexture(tex)
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      let headroomRead = false
      const frameInfo = {
        format: frame.format,
        colorSpace: frame.colorSpace.toJSON(),
        width: frame.codedWidth,
        height: frame.codedHeight,
      }
      const shader = device.createShaderModule({
        code: `
      @group(0) @binding(0) var image: texture_external;
      @group(0) @binding(1) var imageSampler: sampler;
      struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
      @vertex fn vs(@builtin(vertex_index) index: u32) -> Out {
        var points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
        var out: Out;
        out.position = vec4f(points[index],0,1);
        out.uv = points[index] * vec2f(0.5,-0.5) + vec2f(0.5);
        return out;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        return ${direct ? 'vec4f(4.0,4.0,4.0,1.0)' : 'textureSampleBaseClampToEdge(image,imageSampler,in.uv)'};
      }
    `,
      })
      const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            device.createBindGroupLayout({
              entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
              ],
            }),
          ],
        }),
        vertex: { module: shader, entryPoint: 'vs' },
        fragment: { module: shader, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      })
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      })
      const readback = device.createBuffer({
        size: 512,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
      const encoder = device.createCommandEncoder()
      const external = device.importExternalTexture({
        source: frame,
        colorSpace,
        get hdrHeadroom() {
          headroomRead = true
          return 10
        },
      })
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: external },
          { binding: 1, resource: device.createSampler() },
        ],
      })
      for (const view of [texture.createView(), context.getCurrentTexture().createView()]) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.draw(3)
        pass.end()
      }
      encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: 256 }, [
        width,
        height,
      ])
      device.queue.submit([encoder.finish()])
      await readback.mapAsync(GPUMapMode.READ)
      const half = (v) => {
        const exponent = (v >> 10) & 31,
          mantissa = v & 1023
        return (
          (v & 32768 ? -1 : 1) *
          (exponent ? (1 + mantissa / 1024) * 2 ** (exponent - 15) : mantissa * 2 ** -24)
        )
      }
      const values = new Uint16Array(readback.getMappedRange())
      const output = nits.map((n, i) => ({
        ...(fixture || direct
          ? { sampleIndex: i }
          : precision
            ? { inputY10: 512 + i }
            : { inputNits: n }),
        outputRGB: Array.from(values.slice(i * 8, i * 8 + 3), half),
      }))
      readback.unmap()
      readback.destroy()
      texture.destroy()
      frame.close()
      context.unconfigure()
      device.destroy()
      return {
        glResults,
        copyResults,
        headroomRead,
        colorSpace,
        direct,
        frameInfo,
        requestedHardware: !!fixture,
        userAgent: navigator.userAgent,
        displayHDR: matchMedia('(dynamic-range: high)').matches,
        output,
        note: fixture
          ? '真实视频首帧的四个空间采样；没有已知亮度，不用于证明高光裁剪。prefer-hardware 不等于硬解证据。'
          : '合成 PQ 帧导入与高光数值验证；不是硬件解码、真实屏幕亮度或播放器验收',
      }
    },
    { fixture, colorSpace, direct, precision },
  )
  console.log(JSON.stringify({ ...result, decoderProperties }, null, 2))
} finally {
  await browser?.close()
  await electronApp?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  server.close()
}
