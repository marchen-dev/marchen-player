// 小样专用：原始 I420P10 整数平面 → PQ 线性光 → 扩展 sRGB FP16。
// 不使用 VideoFrame 导入，暂不作为正式播放器入口。
export async function createPlanarHdrRenderer(canvas, mode = 'extended', clampToSdr = false) {
  const adapter = await navigator.gpu?.requestAdapter()
  if (!adapter) throw new Error('WebGPU 不可用')
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  context.configure({
    device,
    format: 'rgba16float',
    colorSpace: 'srgb',
    toneMapping: { mode },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const shader = device.createShaderModule({
    code: `
    @group(0) @binding(0) var<storage,read> samples: array<u32>;
    @group(0) @binding(1) var<uniform> params: array<vec4u,3>;
    struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
    @vertex fn vs(@builtin(vertex_index) i:u32)->Out {
      var pos = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
      var out:Out; out.position=vec4f(pos[i],0,1); out.uv=pos[i]*vec2f(0.5,-0.5)+vec2f(0.5); return out;
    }
    fn codeAt(offset:u32)->f32 { let v=samples[offset/4u]; return f32((v >> ((offset%4u)*8u)) & 65535u); }
    fn pq(v:f32)->f32 {
      let p=pow(clamp(v,0.0,1.0),1.0/78.84375);
      return (10000.0/203.0)*pow(max(p-0.8359375,0.0)/max(18.8515625-18.6875*p,0.000001),1.0/0.1593017578125);
    }
    fn srgb(v:f32)->f32 {
      if(v <= 0.0031308) { return 12.92*v; }
      return 1.055*pow(v,1.0/2.4)-0.055;
    }
    @fragment fn fs(in:Out)->@location(0) vec4f {
      let size=params[0].xy;
      let xy=min(vec2u(in.uv*vec2f(size)),size-vec2u(1));
      let y=codeAt(params[1].x+xy.y*params[1].y+xy.x*2u);
      let u=codeAt(params[1].z+(xy.y/2u)*params[1].w+(xy.x/2u)*2u);
      let v=codeAt(params[2].x+(xy.y/2u)*params[2].y+(xy.x/2u)*2u);
      let yy=(y-64.0)/876.0; let uu=(u-512.0)/896.0; let vv=(v-512.0)/896.0;
      let signal=vec3f(yy+1.4746*vv,yy-0.1645531268*uu-0.5713531268*vv,yy+1.8814*uu);
      let linear=mat3x3f(vec3f(1.660491,-0.124550,-0.018151),vec3f(-0.587641,1.132900,-0.100579),vec3f(-0.072850,-0.008349,1.118730))*vec3f(pq(signal.r),pq(signal.g),pq(signal.b));
      let rgb=vec3f(srgb(linear.r),srgb(linear.g),srgb(linear.b));
      return vec4f(${clampToSdr ? 'clamp(rgb,vec3f(0),vec3f(1))' : 'rgb'},1);
    }
  `,
  })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shader, entryPoint: 'vs' },
    fragment: { module: shader, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
  })
  let buffer,
    capacity = 0
  const params = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  return {
    async draw(frame, readPixels = false) {
      if (
        frame.format !== 'I420P10' ||
        frame.colorSpace.transfer !== 'pq' ||
        frame.colorSpace.matrix !== 'bt2020-ncl' ||
        frame.colorSpace.primaries !== 'bt2020' ||
        frame.colorSpace.fullRange !== false
      )
        throw new Error('小样只接受完整 limited BT2020 PQ I420P10')
      const size = Math.ceil(frame.data.byteLength / 4) * 4
      if (size > capacity) {
        buffer?.destroy()
        buffer = device.createBuffer({
          size,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })
        capacity = size
      }
      const upload = size === frame.data.byteLength ? frame.data : new Uint8Array(size)
      if (upload !== frame.data) upload.set(frame.data)
      device.queue.writeBuffer(buffer, 0, upload)
      const [y, u, v] = frame.layout
      device.queue.writeBuffer(
        params,
        0,
        new Uint32Array([
          frame.width,
          frame.height,
          0,
          0,
          y.offset,
          y.stride,
          u.offset,
          u.stride,
          v.offset,
          v.stride,
          0,
          0,
        ]),
      )
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer } },
          { binding: 1, resource: { buffer: params } },
        ],
      })
      if (canvas.width !== frame.width) canvas.width = frame.width
      if (canvas.height !== frame.height) canvas.height = frame.height
      const encoder = device.createCommandEncoder()
      // 直接验证真正送往屏幕的 swap-chain 纹理，避免离屏读回与显示路径不同。
      const texture = context.getCurrentTexture()
      const views = [texture.createView()]
      for (const view of views) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.draw(3)
        pass.end()
      }
      let readback
      if (readPixels) {
        readback = device.createBuffer({
          size: 1024,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
        for (let i = 0; i < 4; i++)
          encoder.copyTextureToBuffer(
            {
              texture,
              origin: [Math.floor(((i + 0.5) * frame.width) / 4), Math.floor(frame.height / 2)],
            },
            { buffer: readback, offset: i * 256, bytesPerRow: 256 },
            [1, 1],
          )
      }
      device.queue.submit([encoder.finish()])
      if (!readback) return null
      await readback.mapAsync(GPUMapMode.READ)
      const bytes = new Uint16Array(readback.getMappedRange())
      const half = (v) => {
        const e = (v >> 10) & 31,
          m = v & 1023
        return (v & 32768 ? -1 : 1) * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24)
      }
      const result = Array.from({ length: 4 }, (_, i) =>
        Array.from(bytes.slice(i * 128, i * 128 + 3), half),
      )
      readback.unmap()
      readback.destroy()
      // 画布交换纹理由浏览器管理，不主动销毁。
      return result
    },
    diagnostics() {
      const config = context.getConfiguration()
      return {
        format: config?.format,
        colorSpace: config?.colorSpace,
        toneMapping: config?.toneMapping,
        hdr: matchMedia('(dynamic-range: high)').matches,
      }
    },
    close() {
      context.unconfigure()
      buffer?.destroy()
      params.destroy()
      device.destroy()
    },
  }
}
