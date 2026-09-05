import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const localSmokeSampleDefinitions = [
  {
    id: 'hevc-main10-hdr-eac3',
    environment: 'MARCHEN_SMOKE_HEVC_MAIN10_HDR_EAC3',
    traits: ['hevc', 'main10', 'hdr', 'eac3'],
  },
  {
    id: 'hevc-main10-sdr-flac',
    environment: 'MARCHEN_SMOKE_HEVC_MAIN10_SDR_FLAC',
    traits: ['hevc', 'main10', 'sdr-or-unknown', 'flac'],
  },
  { id: 'av1', environment: 'MARCHEN_SMOKE_AV1', traits: ['av1'] },
  { id: 'vp9', environment: 'MARCHEN_SMOKE_VP9', traits: ['vp9'] },
  { id: 'vc1', environment: 'MARCHEN_SMOKE_VC1', traits: ['vc1'] },
  { id: 'mpeg2', environment: 'MARCHEN_SMOKE_MPEG2', traits: ['mpeg2video'] },
  {
    id: 'long-gop',
    environment: 'MARCHEN_SMOKE_LONG_GOP',
    traits: ['long-gop'],
  },
  {
    id: 'vfr-nonzero-start',
    environment: 'MARCHEN_SMOKE_VFR_NONZERO_START',
    traits: ['vfr', 'nonzero-start-time'],
  },
]

/**
 * 真实媒体只通过本机环境变量引用。返回值刻意只保留 basename，避免 CI 日志和
 * 可提交结果携带用户目录；实际绝对路径只存在于当前进程的私有字段中。
 */
export const resolveLocalSmokeMatrix = (environment = process.env) =>
  localSmokeSampleDefinitions.map((definition) => {
    const configured = environment[definition.environment]?.trim()
    if (!configured) {
      return { ...definition, status: 'skipped', reason: 'not-configured' }
    }

    const path = resolve(configured)
    if (!existsSync(path)) {
      return {
        ...definition,
        status: 'invalid',
        reason: 'configured-file-missing',
        file: basename(path),
      }
    }

    return { ...definition, status: 'available', file: basename(path), path }
  })

const publicResult = (sample) => {
  const { path: _path, ...safe } = sample
  return safe
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCli) {
  const matrix = resolveLocalSmokeMatrix()
  const result = matrix.map(publicResult)
  console.log(JSON.stringify(result, null, 2))
  if (matrix.some((sample) => sample.status === 'invalid')) process.exitCode = 1
}
