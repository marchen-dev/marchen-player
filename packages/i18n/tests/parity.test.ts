import { describe, expect, it } from 'vitest'
import { MESSAGE_NAMESPACES, MESSAGE_RESOURCES } from '../src/create'

/** i18next 的单复数后缀；英文有 one / other，中文只有 other */
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/
/** 插值占位：`{{name}}` 或带格式的 `{{value, number}}`，变量名是逗号前的部分 */
const VARIABLE = /\{\{([^}]+)\}\}/g

type Flat = Map<string, string>

const flatten = (value: unknown, prefix = '', out: Flat = new Map()): Flat => {
  if (typeof value === 'string') out.set(prefix, value)
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
  } else out.set(prefix, String(value))
  return out
}

const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, '')

/** 每条文案（合并它的各个单复数形式）用到的插值变量 */
const variablesByBaseKey = (flat: Flat) => {
  const result = new Map<string, Set<string>>()
  for (const [key, text] of flat) {
    const variables = result.get(baseKey(key)) ?? new Set<string>()
    for (const match of text.matchAll(VARIABLE)) variables.add(match[1].split(',')[0].trim())
    result.set(baseKey(key), variables)
  }
  return result
}

/** 找出两种语言不一致的地方，返回可读的问题列表；空列表表示一致 */
export const findParityIssues = (source: unknown, target: unknown): string[] => {
  const issues: string[] = []
  const sourceFlat = flatten(source)
  const targetFlat = flatten(target)
  const sourceVariables = variablesByBaseKey(sourceFlat)
  const targetVariables = variablesByBaseKey(targetFlat)

  for (const key of sourceVariables.keys())
    if (!targetVariables.has(key)) issues.push(`缺少译文：${key}`)
  for (const key of targetVariables.keys())
    if (!sourceVariables.has(key)) issues.push(`多出没有源文案的译文：${key}`)

  for (const [key, variables] of sourceVariables) {
    const translated = targetVariables.get(key)
    if (!translated) continue
    const expected = [...variables].sort().join(', ')
    const actual = [...translated].sort().join(', ')
    if (expected !== actual)
      issues.push(`插值变量不一致：${key}（源：${expected || '无'}；译文：${actual || '无'}）`)
  }

  for (const [flat, name] of [
    [sourceFlat, '源文案'],
    [targetFlat, '译文'],
  ] as const) {
    const keys = new Set(flat.keys())
    for (const [key, text] of flat) {
      if (!text.trim()) issues.push(`${name}为空：${key}`)
      // 带数量的文案必须有 other 形式，其他形式缺失时由它兜底
      if (PLURAL_SUFFIX.test(key) && !keys.has(`${baseKey(key)}_other`))
        issues.push(`${name}缺少 _other 形式：${baseKey(key)}`)
    }
  }
  return issues
}

describe('两种语言的文案一致', () => {
  it('命名空间相同', () => {
    expect(Object.keys(MESSAGE_RESOURCES.en).sort()).toEqual([...MESSAGE_NAMESPACES].sort())
  })

  it.each(MESSAGE_NAMESPACES)('%s：键、插值变量齐全，没有空文案', (namespace) => {
    expect(
      findParityIssues(MESSAGE_RESOURCES['zh-CN'][namespace], MESSAGE_RESOURCES.en[namespace]),
    ).toEqual([])
  })
})

describe('一致性检查本身', () => {
  it('能发现缺少的译文', () => {
    expect(findParityIssues({ a: '甲', b: { c: '乙' } }, { a: 'A' })).toEqual(['缺少译文：b.c'])
  })

  it('能发现多出的译文', () => {
    expect(findParityIssues({ a: '甲' }, { a: 'A', extra: 'E' })).toEqual([
      '多出没有源文案的译文：extra',
    ])
  })

  it('能发现插值变量不一致', () => {
    expect(findParityIssues({ a: '共 {{count}} 条，{{name}}' }, { a: '{{count}} items' })).toEqual([
      '插值变量不一致：a（源：count, name；译文：count）',
    ])
  })

  it('英文多出的单数形式不算不一致', () => {
    expect(
      findParityIssues(
        { items_other: '共 {{count}} 条' },
        { items_one: 'One item', items_other: '{{count}} items' },
      ),
    ).toEqual([])
  })

  it('能发现空文案与缺少 other 形式', () => {
    expect(
      findParityIssues({ a: '甲', n_other: '{{count}}' }, { a: ' ', n_one: '{{count}}' }),
    ).toEqual(['译文为空：a', '译文缺少 _other 形式：n'])
  })
})
