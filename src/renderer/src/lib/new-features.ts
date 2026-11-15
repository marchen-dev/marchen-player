/**
 * 「新功能」标记的登记表与显示规则。
 *
 * 新增一个需要提示用户的功能时：在 NEW_FEATURES 里登记一行（功能 ID 与引入它的版本号），
 * 在功能标题旁放一个 <NewBadge feature="..." />，并在用户实际用到这个功能的地方调用
 * markNewFeatureSeen。标记何时消失由这里统一决定，调用方不需要自己判断：
 *
 * - 用过就消失：用户用过这个功能后不再显示。
 * - 到期也消失：没用过的话，只在引入它的版本和紧随其后的一个补丁版本里显示，
 *   之后不再打扰（升级到新的次版本或主版本也视为到期）。
 *
 * 到期的条目可以随时从登记表里删掉；留着也不会再显示。
 */

export const NEW_FEATURES = {
  /** 弹幕翻译：播放器侧栏弹幕页的下拉框 */
  'danmaku-translation': { since: '1.1.8' },
} as const satisfies Record<string, { since: string }>

export type NewFeatureId = keyof typeof NEW_FEATURES

/** 引入版本之后还继续显示标记的补丁版本数 */
const EXTRA_PATCH_RELEASES = 1

/** 取版本号的主、次、补丁三段，忽略 `-beta.1` 之类的预发布后缀；无法解析时返回 null */
const parseVersion = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** 当前版本是否还在某个功能的「新」窗口内 */
export const isWithinNewWindow = (since: string, current: string): boolean => {
  const from = parseVersion(since)
  const now = parseVersion(current)
  // 版本号读不出来时宁可不显示，避免标记永远挂着
  if (!from || !now) return false
  const [major, minor, patch] = from
  // 还没到引入版本（开发中、版本号尚未提升）：功能已经在代码里，按新功能显示
  if (now[0] < major || (now[0] === major && now[1] < minor)) return true
  if (now[0] !== major || now[1] !== minor) return false
  return now[2] <= patch + EXTRA_PATCH_RELEASES
}

/** 是否显示某个功能的「新」标记 */
export const shouldShowNewBadge = (
  feature: NewFeatureId,
  currentVersion: string,
  seen: readonly string[],
): boolean =>
  !seen.includes(feature) && isWithinNewWindow(NEW_FEATURES[feature].since, currentVersion)
