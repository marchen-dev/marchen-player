import { compareReleaseVersions } from '@marchen/shared/update-policy'

/** 手动安装也按实际版本判断升级；渠道限制只用于自动检查。 */
export function isVersionUpgrade(previous: string, current: string): boolean {
  try {
    return compareReleaseVersions(current, previous) > 0
  } catch {
    return false
  }
}
