import type { BitmapSubtitleSession } from '../platform/ports'
import type { LibassSubtitleAdapter } from './libass-subtitle-adapter'
import type { PgsSubtitleAdapter } from './pgs-subtitle-adapter'

/**
 * 文本（libass）与位图（PGS）两个渲染器的统一入口。
 * 字幕上下文只持有这一个对象：换上一方时先关闭另一方，保证两种字幕不会同时出现；
 * 关闭、偏移、尺寸与每帧同步同时作用于两者，避免某个调用点漏掉一方。
 */
export class SubtitleRenderers {
  constructor(
    readonly text: LibassSubtitleAdapter,
    readonly bitmap: PgsSubtitleAdapter,
  ) {}

  /** 文本字幕；参数与 LibassSubtitleAdapter.setTrack 相同 */
  setTrack(...args: Parameters<LibassSubtitleAdapter['setTrack']>): boolean {
    this.bitmap.close()
    return this.text.setTrack(...args)
  }

  setBitmapTrack(session: BitmapSubtitleSession, release?: () => void): boolean {
    this.text.close()
    return this.bitmap.setSession(session, release)
  }

  close(): void {
    this.text.close()
    this.bitmap.close()
  }

  /** 字号只对文本字幕生效；位图字幕不支持调整大小 */
  setFontScale(percentage: number): void {
    this.text.setFontScale(percentage)
  }

  setTimeOffset(offset: number): void {
    this.text.setTimeOffset(offset)
    this.bitmap.setTimeOffset(offset)
  }

  resize(): void {
    this.text.resize()
    this.bitmap.resize()
  }

  sync(): void {
    this.text.sync()
    this.bitmap.sync()
  }

  dispose(): void {
    this.text.dispose()
    this.bitmap.dispose()
  }
}
