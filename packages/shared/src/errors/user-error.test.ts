import { describe, expect, it } from 'vitest'
import {
  decodeUserError,
  encodeUserError,
  errorFromText,
  errorToText,
  isUserError,
  toUserError,
  UserError,
} from './index'

describe('userError', () => {
  it('带错误码、参数与中文说明', () => {
    const error = new UserError('danmakuLink.http', '接口返回 503', { status: 503 })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('UserError')
    expect(error.code).toBe('danmakuLink.http')
    expect(error.params).toEqual({ status: 503 })
    expect(error.message).toBe('接口返回 503')
  })

  it('保留原因', () => {
    const cause = new Error('底层原因')
    expect(new UserError('a.b', '失败', undefined, { cause }).cause).toBe(cause)
  })

  it('按形状也能识别（跨打包产物时 instanceof 可能失效）', () => {
    const lookalike = Object.assign(new Error('失败'), { name: 'UserError', code: 'a.b' })
    expect(isUserError(lookalike)).toBe(true)
    expect(isUserError(new UserError('a.b', '失败'))).toBe(true)
    expect(isUserError(new Error('失败'))).toBe(false)
    expect(isUserError({ name: 'UserError', code: 'a.b' })).toBe(false)
    expect(isUserError(null)).toBe(false)
  })
})

describe('编码与解码', () => {
  it('往返后内容不变', () => {
    const payload = {
      code: 'downloads.disk_full',
      params: { name: '第一集.mkv', free: 12 },
      message: '磁盘空间不足',
    }
    expect(decodeUserError(encodeUserError(payload))).toEqual(payload)
  })

  it('没有参数时不带参数段', () => {
    const text = encodeUserError({ code: 'a.b', message: '失败' })
    expect(text).toBe('⟦a.b⟧失败')
    expect(decodeUserError(text)).toEqual({ code: 'a.b', message: '失败' })
    expect(encodeUserError({ code: 'a.b', params: {}, message: '失败' })).toBe('⟦a.b⟧失败')
  })

  it('编码后的文字仍然带着中文说明，日志里可读', () => {
    expect(encodeUserError(new UserError('a.b', '链接无效', { status: 404 }))).toBe(
      '⟦a.b|{"status":404}⟧链接无效',
    )
  })

  it('标记前面有其他文字时也能解码（Electron 跨进程的前缀）', () => {
    const text = `Error invoking remote method 'danmaku:import': Error: ${encodeUserError({
      code: 'danmakuLink.invalid_url',
      message: '链接无效',
    })}`
    expect(decodeUserError(text)).toEqual({ code: 'danmakuLink.invalid_url', message: '链接无效' })
  })

  it('参数值里含标记字符或引号时不破坏格式', () => {
    const payload = { code: 'a.b', params: { name: '奇怪⟧的"文件|名' }, message: '失败⟧了' }
    const text = encodeUserError(payload)
    // 第一个结束标记就是真正的结束位置：参数里的那个已被转义
    expect(text.slice(text.indexOf('⟧') + 1)).toBe('失败⟧了')
    expect(decodeUserError(text)).toEqual(payload)
  })

  it('普通文字、旧版本保存的纯中文返回 null', () => {
    expect(decodeUserError('下载记录保存失败')).toBeNull()
    expect(decodeUserError('')).toBeNull()
    expect(decodeUserError(undefined)).toBeNull()
    expect(decodeUserError(42)).toBeNull()
  })

  it('畸形输入返回 null 而不抛出', () => {
    expect(decodeUserError('⟦a.b')).toBeNull()
    expect(decodeUserError('⟦有空格 的码⟧失败')).toBeNull()
    expect(decodeUserError('⟦⟧失败')).toBeNull()
    expect(decodeUserError('⟦a.b|不是 JSON⟧失败')).toBeNull()
    expect(decodeUserError('⟦a.b|[1,2]⟧失败')).toBeNull()
    expect(decodeUserError('⟦a.b|{"x":{"nested":1}}⟧失败')).toBeNull()
  })

  it('还原成错误对象', () => {
    const error = toUserError({ code: 'a.b', params: { n: 1 }, message: '失败' })
    expect(isUserError(error)).toBe(true)
    expect(error.params).toEqual({ n: 1 })
  })
})

describe('错误与文字互转', () => {
  it('用户错误转成文字后能还原出错误码、参数与说明', () => {
    const text = errorToText(
      new UserError('downloads.name_conflict', '保存目录中已存在「a.mkv」', { name: 'a.mkv' }),
      '下载操作失败',
    )
    const restored = errorFromText(text)
    expect(isUserError(restored)).toBe(true)
    expect(restored).toMatchObject({
      code: 'downloads.name_conflict',
      params: { name: 'a.mkv' },
      message: '保存目录中已存在「a.mkv」',
    })
  })

  it('普通错误只保留说明，还原后仍是普通错误', () => {
    const text = errorToText(new Error('ENOSPC'), '下载操作失败')
    expect(text).toBe('ENOSPC')
    const restored = errorFromText(text)
    expect(isUserError(restored)).toBe(false)
    expect(restored.message).toBe('ENOSPC')
  })

  it('不是错误对象或没有说明时用兜底说明', () => {
    expect(errorToText('字符串', '下载操作失败')).toBe('下载操作失败')
    const blank = new Error('占位')
    blank.message = ''
    expect(errorToText(blank, '下载操作失败')).toBe('下载操作失败')
  })
})
