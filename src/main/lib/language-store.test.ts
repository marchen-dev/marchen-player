import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLanguageStore } from './language-store'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marchen-language-'))
  file = join(dir, 'language.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('界面语言镜像', () => {
  it('没有文件时读到 null', () => {
    expect(createLanguageStore(file).read()).toBeNull()
  })

  it('写入后能读回', () => {
    const store = createLanguageStore(file)
    expect(store.write('en')).toBe(true)
    expect(store.read()).toBe('en')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ language: 'en' })
  })

  it('内容损坏或语言不受支持时按不存在处理', () => {
    const store = createLanguageStore(file)
    for (const content of [
      '',
      'not json',
      'null',
      '"en"',
      '{}',
      '{"language":"ja"}',
      '{"language":1}',
    ]) {
      writeFileSync(file, content, 'utf8')
      expect(store.read()).toBeNull()
    }
  })

  it('不把伪本地化当成可保存的语言', () => {
    writeFileSync(file, '{"language":"pseudo"}', 'utf8')
    expect(createLanguageStore(file).read()).toBeNull()
  })

  it('清除后读到 null，重复清除不报错', () => {
    const store = createLanguageStore(file)
    store.write('zh-CN')
    store.clear()
    store.clear()
    expect(store.read()).toBeNull()
  })

  it('写入失败时返回 false 而不抛出', () => {
    expect(createLanguageStore(join(dir, 'missing', 'language.json')).write('en')).toBe(false)
  })
})
