import { describe, expect, it } from 'vitest'
import { createPseudoResources, pseudoLocalize } from '../src/pseudo'

describe('伪本地化', () => {
  it('加标记、换成带变音符号的字母并加长', () => {
    const result = pseudoLocalize('Settings')
    expect(result.startsWith('[')).toBe(true)
    expect(result.endsWith(']')).toBe(true)
    expect(result).toContain('Šéţţíñĝš')
    expect(result.length).toBeGreaterThan('Settings'.length * 1.4)
  })

  it('保留插值变量、标签与嵌套引用', () => {
    const result = pseudoLocalize('About {{count}} <b>seconds</b> $t(common:action.close)')
    expect(result).toContain('{{count}}')
    expect(result).toContain('<b>')
    expect(result).toContain('</b>')
    expect(result).toContain('$t(common:action.close)')
  })

  it('没有字母的文案只加标记，不加填充', () => {
    expect(pseudoLocalize('{{count}}')).toBe('[{{count}}]')
    expect(pseudoLocalize('100%')).toBe('[100%]')
  })

  it('整份资源保持结构', () => {
    const result = createPseudoResources({ a: 'Hi', b: { c: 'Yo {{name}}' } })
    expect(Object.keys(result)).toEqual(['a', 'b'])
    expect(result.a).toMatch(/^\[Ĥí ~+\]$/)
    expect(result.b.c).toContain('{{name}}')
  })
})
