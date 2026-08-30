import type { PlaybackSourceLease } from '@marchen/shared/media'

/** 异步 prepare 的单调 generation；迟到 lease 在进入 Runtime 前立即释放。 */
export class PlaybackSourceGenerationGuard {
  #current = 0

  begin(): number {
    this.#current += 1
    return this.#current
  }

  isCurrent(generation: number): boolean {
    return generation === this.#current
  }

  invalidate(generation: number): void {
    if (this.isCurrent(generation)) this.#current += 1
  }

  accept(generation: number, lease: PlaybackSourceLease): PlaybackSourceLease | null {
    if (this.isCurrent(generation)) return lease
    lease.release()
    return null
  }
}
