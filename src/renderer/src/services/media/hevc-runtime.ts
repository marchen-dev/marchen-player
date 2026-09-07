export interface Frame {
  data: Uint8Array<ArrayBuffer>
  layout: PlaneLayout[]
  width: number
  height: number
  format: number
  pts: number
  ptshi: number
  time_base_num: number
  time_base_den: number
  crop: { top: number; bottom: number; left: number; right: number }
}

export interface HevcMemoryStats {
  linearMemoryBytes: number
  activePthreads: number
  idlePthreads: number
}

export interface Runtime {
  libavjsMode?: string
  /** 包含调度 pthread，不能作为解码线程数；线性内存也不是进程 RSS。 */
  libavjsMemoryStats?: () => HevcMemoryStats
  ff_init_decoder: (name: string, options: unknown) => Promise<[number, number, number, number]>
  ff_decode_multi: (
    context: number,
    packet: number,
    frame: number,
    packets: unknown[],
    options: unknown,
  ) => Promise<Frame[]>
  ff_free_decoder: (context: number, packet: number, frame: number) => Promise<void>
  terminate: () => void
}

interface Loader {
  LibAV: (options: { base: string; noworker: boolean; yesthreads: boolean }) => Promise<Runtime>
}

export async function loadHevcRuntime(assetBase: string, threads: 1 | 2 | 4) {
  if (![1, 2, 4].includes(threads)) throw new Error('HEVC 解码线程数必须为 1、2 或 4')
  const base = assetBase.replace(/\/$/, '')
  const loader = (await import(
    /* @vite-ignore */ `${base}/libav-6.10.9.0-decoder-hevc.mjs`
  )) as Loader
  return loader.LibAV({ base, noworker: true, yesthreads: threads > 1 })
}
