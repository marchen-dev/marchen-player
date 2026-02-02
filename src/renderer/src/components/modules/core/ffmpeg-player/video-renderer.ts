/**
 * 视频渲染器
 * 
 * 支持两种渲染方式：
 * 1. Canvas 2D - 简单，但性能较低
 * 2. WebGL - 高性能，支持 YUV 直接渲染
 */

export interface RendererOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  preferWebGL?: boolean
}

/**
 * Canvas 2D 渲染器
 * 简单直接，适合低分辨率或兼容性要求高的场景
 */
export class Canvas2DRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  
  constructor(options: RendererOptions) {
    this.canvas = options.canvas
    this.canvas.width = options.width
    this.canvas.height = options.height
    
    const ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true  // 提高性能
    })
    
    if (!ctx) {
      throw new Error('Failed to get 2d context')
    }
    
    this.ctx = ctx
  }

  /**
   * 渲染 VideoFrame（WebCodecs 输出）
   */
  render(frame: VideoFrame) {
    // VideoFrame 可以直接绘制到 canvas
    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * 渲染 ImageData（WASM 解码输出 RGBA）
   */
  renderImageData(imageData: ImageData) {
    this.ctx.putImageData(imageData, 0, 0)
  }

  /**
   * 渲染 RGBA buffer
   */
  renderRGBA(buffer: Uint8ClampedArray, width: number, height: number) {
    const imageData = new ImageData(buffer, width, height)
    this.ctx.putImageData(imageData, 0, 0)
  }

  /**
   * 清空画布
   */
  clear() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * 调整大小
   */
  resize(width: number, height: number) {
    this.canvas.width = width
    this.canvas.height = height
  }

  destroy() {
    this.clear()
  }
}


/**
 * WebGL 渲染器
 * 高性能，支持 YUV -> RGB 在 GPU 上转换
 */
export class WebGLRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private textures: WebGLTexture[] = []
  
  // Uniform locations
  private yTextureLoc: WebGLUniformLocation | null = null
  private uTextureLoc: WebGLUniformLocation | null = null
  private vTextureLoc: WebGLUniformLocation | null = null
  
  private videoWidth: number
  private videoHeight: number

  // YUV -> RGB 转换矩阵 (BT.709)
  private static readonly VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  private static readonly FRAGMENT_SHADER_YUV = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_yTexture;
    uniform sampler2D u_uTexture;
    uniform sampler2D u_vTexture;
    
    void main() {
      float y = texture2D(u_yTexture, v_texCoord).r;
      float u = texture2D(u_uTexture, v_texCoord).r - 0.5;
      float v = texture2D(u_vTexture, v_texCoord).r - 0.5;
      
      // BT.709 YUV -> RGB
      float r = y + 1.5748 * v;
      float g = y - 0.1873 * u - 0.4681 * v;
      float b = y + 1.8556 * u;
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `

  // 用于直接渲染 VideoFrame/RGBA 的 shader
  private static readonly FRAGMENT_SHADER_RGBA = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    
    void main() {
      gl_FragColor = texture2D(u_texture, v_texCoord);
    }
  `

  constructor(options: RendererOptions) {
    this.canvas = options.canvas
    this.canvas.width = options.width
    this.canvas.height = options.height
    this.videoWidth = options.width
    this.videoHeight = options.height
    
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: 'high-performance'
    })
    
    if (!gl) {
      throw new Error('WebGL not supported')
    }
    
    this.gl = gl
    this.program = this.createProgram(
      WebGLRenderer.VERTEX_SHADER,
      WebGLRenderer.FRAGMENT_SHADER_YUV
    )
    
    this.initBuffers()
    this.initTextures()
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const {gl} = this
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource)
    
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${  gl.getProgramInfoLog(program)}`)
    }
    
    return program
  }

  private compileShader(type: number, source: string): WebGLShader {
    const {gl} = this
    const shader = gl.createShader(type)!
    
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${  gl.getShaderInfoLog(shader)}`)
    }
    
    return shader
  }

  private initBuffers() {
    const {gl} = this
    
    // 顶点位置（全屏四边形）
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ])
    
    // 纹理坐标（Y轴翻转）
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0
    ])
    
    // 创建并绑定顶点缓冲
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    
    const positionLoc = gl.getAttribLocation(this.program, 'a_position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)
    
    // 创建并绑定纹理坐标缓冲
    const texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
    
    const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord')
    gl.enableVertexAttribArray(texCoordLoc)
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0)
  }

  private initTextures() {
    const {gl} = this
    
    gl.useProgram(this.program)
    
    // 创建 Y, U, V 三个纹理
    for (let i = 0; i < 3; i++) {
      const texture = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      
      // 设置纹理参数
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      
      this.textures.push(texture)
    }
    
    // 设置 uniform
    this.yTextureLoc = gl.getUniformLocation(this.program, 'u_yTexture')
    this.uTextureLoc = gl.getUniformLocation(this.program, 'u_uTexture')
    this.vTextureLoc = gl.getUniformLocation(this.program, 'u_vTexture')
    
    gl.uniform1i(this.yTextureLoc, 0)
    gl.uniform1i(this.uTextureLoc, 1)
    gl.uniform1i(this.vTextureLoc, 2)
  }

  /**
   * 渲染 YUV420P 数据（WASM 解码器可能输出这种格式）
   */
  renderYUV(
    yPlane: Uint8Array, yStride: number,
    uPlane: Uint8Array, uStride: number,
    vPlane: Uint8Array, vStride: number,
    width: number, height: number
  ) {
    const {gl} = this
    
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    
    // 上传 Y 平面
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0])
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      yStride, height, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, yPlane
    )
    
    // 上传 U 平面
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[1])
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      uStride, height / 2, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, uPlane
    )
    
    // 上传 V 平面
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[2])
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      vStride, height / 2, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, vPlane
    )
    
    // 绘制
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /**
   * 渲染 VideoFrame（WebCodecs 输出）
   * 使用 texImage2D 直接上传 VideoFrame
   */
  render(frame: VideoFrame) {
    const {gl} = this
    
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    
    // VideoFrame 可以直接作为纹理源
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0])
    
    // @ts-ignore - VideoFrame 可以作为 texImage2D 的源
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  clear() {
    const {gl} = this
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  resize(width: number, height: number) {
    this.canvas.width = width
    this.canvas.height = height
    this.videoWidth = width
    this.videoHeight = height
  }

  destroy() {
    const {gl} = this
    
    for (const texture of this.textures) {
      gl.deleteTexture(texture)
    }
    
    gl.deleteProgram(this.program)
  }
}


/**
 * 渲染器工厂
 */
export function createRenderer(options: RendererOptions): Canvas2DRenderer | WebGLRenderer {
  if (options.preferWebGL) {
    try {
      return new WebGLRenderer(options)
    } catch (e) {
      console.warn('WebGL not available, falling back to Canvas 2D:', e)
    }
  }
  
  return new Canvas2DRenderer(options)
}
