import { describe, expect, it } from 'vitest'
import { readTranslationAssetsBase } from '../assets/config'
import {
  listTranslationAssets,
  totalAssetSize,
  TRANSLATION_ENGINE,
  translationAssetUrl,
} from '../assets/manifest'

describe('翻译资源基址', () => {
  it('未配置或为空白时返回 null，不抛错', () => {
    expect(readTranslationAssetsBase({})).toBeNull()
    expect(readTranslationAssetsBase({ VITE_TRANSLATION_ASSETS_URL: '   ' })).toBeNull()
  })

  it('接受 HTTPS 基址并去掉末尾斜杠', () => {
    expect(
      readTranslationAssetsBase({
        VITE_TRANSLATION_ASSETS_URL: ' https://assets.example.invalid/translation/ ',
      }),
    ).toBe('https://assets.example.invalid/translation')
  })

  it('本机回环地址允许 HTTP，其他主机不允许', () => {
    expect(
      readTranslationAssetsBase({
        VITE_TRANSLATION_ASSETS_URL: 'http://127.0.0.1:8787/translation',
      }),
    ).toBe('http://127.0.0.1:8787/translation')
    expect(
      readTranslationAssetsBase({ VITE_TRANSLATION_ASSETS_URL: 'http://localhost:8787/t' }),
    ).toBe('http://localhost:8787/t')
    expect(() =>
      readTranslationAssetsBase({ VITE_TRANSLATION_ASSETS_URL: 'http://assets.example.invalid/t' }),
    ).toThrow(/HTTPS/)
  })

  it('拒绝非法地址、查询参数与片段', () => {
    for (const value of [
      'not a url',
      'https://assets.example.invalid/t?x=1',
      'https://assets.example.invalid/t#frag',
      'ftp://assets.example.invalid/t',
    ]) {
      expect(() => readTranslationAssetsBase({ VITE_TRANSLATION_ASSETS_URL: value })).toThrow(
        /VITE_TRANSLATION_ASSETS_URL/,
      )
    }
  })
})

describe('翻译资源清单', () => {
  it('英文目标包含引擎与三个模型文件，名称互不相同', () => {
    const files = listTranslationAssets('en')
    expect(files.map((file) => file.kind)).toEqual(['engine', 'model', 'lex', 'vocab'])
    expect(new Set(files.map((file) => file.name)).size).toBe(files.length)
    expect(totalAssetSize(files)).toBe(4_960_506 + 59_504_955 + 9_220_016 + 1_359_697)
  })

  it('哈希均为 64 位小写十六进制，路径指向 gzip 文件', () => {
    for (const file of listTranslationAssets('en')) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(file.path.endsWith('.gz')).toBe(true)
      expect(file.size).toBeGreaterThan(0)
    }
  })

  it('由基址生成下载地址时归一多余的斜杠', () => {
    expect(translationAssetUrl('https://a.example.invalid/translation/', TRANSLATION_ENGINE)).toBe(
      'https://a.example.invalid/translation/engine/4.0/bergamot-translator.wasm.gz',
    )
  })
})
