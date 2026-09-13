import fragment from './hdr-sdr.frag?raw'

/** 关口候选：BT.2020 NCL PQ/HLG → BT.709/sRGB；100 nit 线性单位、1000 nit 源峰值、Hable。
 * HDR 输出和动态峰值不由此模块处理。YUV 直接上传整数纹理，不做 CPU RGBA 转换。
 */
export class HdrSdrRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly textures: WebGLTexture[] = []
  private closed = false

  constructor(canvas: OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, depth: false, antialias: false })
    if (!gl) throw new Error('当前环境不支持 HDR→SDR 的 WebGL2 路径')
    this.gl = gl
    const shaders: WebGLShader[] = []
    const program = gl.createProgram()
    if (!program) throw new Error('无法创建色彩转换程序')
    this.program = program
    try {
      for (const [type, source] of [
        [
          gl.VERTEX_SHADER,
          '#version 300 es\nout vec2 uv; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}',
        ],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type)
        if (!shader) throw new Error('无法创建色彩转换着色器')
        shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? '着色器编译失败')
        gl.attachShader(program, shader)
      }
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? '色彩程序链接失败')
      gl.useProgram(program)
      for (let plane = 0; plane < 3; plane++) {
        const texture = gl.createTexture()
        if (!texture) throw new Error('无法分配视频纹理')
        this.textures.push(texture)
        gl.uniform1i(gl.getUniformLocation(program, ['yPlane', 'uPlane', 'vPlane'][plane]), plane)
      }
    } catch (error) {
      this.close()
      throw error
    } finally {
      for (const shader of shaders) gl.deleteShader(shader)
    }
  }

  draw(frame: {
    data: Uint8Array<ArrayBuffer>
    layout: PlaneLayout[]
    width: number
    height: number
    bitDepth: 8 | 10
    colorSpace: {
      // lib.dom 的枚举尚未覆盖浏览器已支持的 PQ/HLG/BT.2020，入口仍做明确值校验。
      primaries?: string | null
      matrix?: string | null
      transfer?: string | null
      fullRange?: boolean | null
    }
    visibleRect?: { left: number; top: number; width: number; height: number }
  }) {
    const gl = this.gl
    if (this.closed || gl.isContextLost()) throw new Error('视频绘制上下文已关闭或丢失')
    const space = frame.colorSpace
    if (
      space.primaries !== 'bt2020' ||
      space.matrix !== 'bt2020-ncl' ||
      !['pq', 'hlg'].includes(space.transfer ?? '') ||
      space.fullRange == null
    )
      throw new Error('HDR 色彩元数据不完整或不受支持，不能按 SDR 猜测')
    if (frame.layout.length !== 3) throw new Error('需要完整三平面 YUV')
    if (![frame.width, frame.height].every((value) => Number.isInteger(value) && value > 0))
      throw new Error('视频尺寸无效')
    const rect = frame.visibleRect ?? { left: 0, top: 0, width: frame.width, height: frame.height }
    if (
      ![rect.left, rect.top, rect.width, rect.height].every(Number.isInteger) ||
      rect.left < 0 ||
      rect.top < 0 ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.left + rect.width > frame.width ||
      rect.top + rect.height > frame.height
    )
      throw new Error('可见画面矩形越界')
    const bpc = frame.bitDepth === 8 ? 1 : 2
    gl.useProgram(this.program)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    for (let plane = 0; plane < 3; plane++) {
      const { offset, stride } = frame.layout[plane]
      const height = plane ? Math.ceil(frame.height / 2) : frame.height
      const width = plane ? Math.ceil(frame.width / 2) : frame.width
      if (
        stride % bpc ||
        (frame.data.byteOffset + offset) % bpc ||
        offset < 0 ||
        stride < width * bpc ||
        offset + stride * height > frame.data.byteLength
      )
        throw new Error('视频平面越界或 stride 无效')
      const bytes =
        bpc === 1
          ? new Uint8Array(frame.data.buffer, frame.data.byteOffset + offset, stride * height)
          : new Uint16Array(
              frame.data.buffer,
              frame.data.byteOffset + offset,
              (stride * height) / 2,
            )
      gl.activeTexture(gl.TEXTURE0 + plane)
      gl.bindTexture(gl.TEXTURE_2D, this.textures[plane])
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        bpc === 1 ? gl.R8UI : gl.R16UI,
        stride / bpc,
        height,
        0,
        gl.RED_INTEGER,
        bpc === 1 ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT,
        bytes,
      )
    }
    gl.uniform4f(
      gl.getUniformLocation(this.program, 'visible'),
      rect.left,
      rect.top,
      rect.width,
      rect.height,
    )
    gl.uniform1f(gl.getUniformLocation(this.program, 'codeScale'), frame.bitDepth === 10 ? 4 : 1)
    gl.uniform1i(gl.getUniformLocation(this.program, 'fullRange'), Number(space.fullRange))
    gl.uniform1i(gl.getUniformLocation(this.program, 'hlg'), Number(space.transfer === 'hlg'))
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.gl.deleteProgram(this.program)
  }
}
