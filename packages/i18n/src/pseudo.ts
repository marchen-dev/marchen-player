/**
 * 伪本地化：把英文文案变成「带标记、更长、仍然读得懂」的样子，只在开发态使用。
 *
 * 用途有两个：
 * - 未迁移的文字保持原样、没有方括号，一眼就能看出哪些地方还没走文案包；
 * - 文案被加长约 40%，提前暴露换成更长的语言后会溢出或被截断的位置。
 */

const ACCENTED: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ó',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ú',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
}

/** 不能改动的片段：插值变量、Trans 用的标签、嵌套引用 */
const PROTECTED = /(\{\{[^}]*\}\}|<[^>]+>|\$t\([^)]*\))/g

/** 加长比例：英文换成德语、俄语等语言时常见的增幅 */
const EXPANSION = 0.4

export function pseudoLocalize(text: string): string {
  let letters = 0
  const body = text
    .split(PROTECTED)
    // split 带捕获组时，奇数下标是被保护的片段，原样保留
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/[a-z]/gi, (char) => {
            letters += 1
            return ACCENTED[char] ?? char
          }),
    )
    .join('')
  const padding = '~'.repeat(Math.ceil(letters * EXPANSION))
  return `[${body}${padding ? ` ${padding}` : ''}]`
}

/** 把一整份文案资源逐条伪本地化，保持结构不变 */
export function createPseudoResources<T>(resources: T): T {
  if (typeof resources === 'string') return pseudoLocalize(resources) as T
  if (resources && typeof resources === 'object') {
    return Object.fromEntries(
      Object.entries(resources).map(([key, value]) => [key, createPseudoResources(value)]),
    ) as T
  }
  return resources
}
