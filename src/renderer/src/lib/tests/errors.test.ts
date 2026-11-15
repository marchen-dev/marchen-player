import { LocalDanmakuImportError } from '@marchen/player-loading'
import { encodeUserError, UserError } from '@marchen/shared/errors'
import { RemoteMediaError, validateRemoteUrl } from '@marchen/shared/media/remote'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { describeError, hasErrorCode } from '../errors'
import { i18n } from '../i18n'
import { LocalDanmakuValidationError } from '../local-danmaku'

beforeAll(() => {
  // 测试专用的错误码，不依赖真实文案的增减
  i18n.addResourceBundle(
    'zh-CN',
    'errors',
    { demo: { http: '接口返回 {{status}}', auth_failed: '账号或密码错误' } },
    true,
    true,
  )
  i18n.addResourceBundle(
    'en',
    'errors',
    { demo: { http: 'The server returned {{status}}', auth_failed: 'Wrong username or password' } },
    true,
    true,
  )
})
afterEach(() => i18n.changeLanguage('zh-CN'))

const FALLBACK_ZH = '字幕加载失败'
const FALLBACK_EN = "Couldn't load subtitles"

describe('有错误码且有文案', () => {
  const error = new UserError('demo.http', '接口返回 503（中文日志说明）', { status: 503 })

  it('简体中文显示错误原来的说明，其他语言按错误码取文案并带上参数', async () => {
    // 原说明比错误码对应的文案更具体，中文界面保持与引入多语言之前一致
    expect(describeError(error, FALLBACK_ZH)).toBe('接口返回 503（中文日志说明）')
    await i18n.changeLanguage('en')
    expect(describeError(error, FALLBACK_EN)).toBe('The server returned 503')
  })

  it('简体中文下错误没有带说明时，按错误码取文案', () => {
    expect(describeError(new UserError('demo.http', '', { status: 404 }), FALLBACK_ZH)).toBe(
      '接口返回 404',
    )
    expect(describeError({ code: 'demo.auth_failed' }, FALLBACK_ZH)).toBe('账号或密码错误')
  })

  it('编码在文字里的错误码同样生效（进程间调用、保存在本机的失败原因）', async () => {
    const text = encodeUserError(error)
    const viaIpc = new Error(`Error invoking remote method 'x:y': Error: ${text}`)
    await i18n.changeLanguage('en')
    expect(describeError(text, FALLBACK_EN)).toBe('The server returned 503')
    expect(describeError(viaIpc, FALLBACK_EN)).toBe('The server returned 503')
  })

  it('裸错误码配合域查文案', async () => {
    const result = { ok: false, code: 'auth_failed', message: '账号或密码错误，或登录已失效' }
    expect(describeError(result, FALLBACK_ZH, { domain: 'demo' })).toBe(
      '账号或密码错误，或登录已失效',
    )
    await i18n.changeLanguage('en')
    expect(describeError(result, FALLBACK_EN, { domain: 'demo' })).toBe(
      'Wrong username or password',
    )
    // 没给域时不把裸错误码当成文案键
    expect(describeError(result, FALLBACK_EN)).toBe(FALLBACK_EN)
    // 结果对象上的错误码已经带域时不需要再给
    const scoped = { ok: false, code: 'demo.auth_failed', message: '账号或密码错误' }
    expect(describeError(scoped, FALLBACK_EN)).toBe('Wrong username or password')
  })
})

describe('没有专门的文案', () => {
  const internal = new Error('EBML 元素长度超出文件范围')

  it('简体中文界面显示原来的中文说明', () => {
    expect(describeError(internal, FALLBACK_ZH)).toBe('EBML 元素长度超出文件范围')
    expect(describeError('旧版本保存的失败原因', FALLBACK_ZH)).toBe('旧版本保存的失败原因')
  })

  it('英文界面只显示概括说明，不显示中文细节', async () => {
    await i18n.changeLanguage('en')
    expect(describeError(internal, FALLBACK_EN)).toBe(FALLBACK_EN)
    expect(describeError('旧版本保存的失败原因', FALLBACK_EN)).toBe(FALLBACK_EN)
  })

  it('英文界面下原始说明不含汉字时附在概括之后', async () => {
    await i18n.changeLanguage('en')
    expect(describeError(new TypeError('Failed to fetch'), FALLBACK_EN)).toBe(
      "Couldn't load subtitles: Failed to fetch",
    )
  })

  it('有错误码但没有文案时按没有错误码处理', async () => {
    const unknownCode = new UserError('demo.not_translated', '尚未补文案的失败')
    expect(describeError(unknownCode, FALLBACK_ZH)).toBe('尚未补文案的失败')
    await i18n.changeLanguage('en')
    expect(describeError(unknownCode, FALLBACK_EN)).toBe(FALLBACK_EN)
  })

  it('编码过但没有文案的错误，简体中文界面不显示编码标记', () => {
    const text = encodeUserError({ code: 'demo.not_translated', message: '尚未补文案的失败' })
    expect(describeError(text, FALLBACK_ZH)).toBe('尚未补文案的失败')
  })
})

describe('取不到任何信息', () => {
  it('显示概括说明，不显示空白', async () => {
    for (const value of [
      undefined,
      null,
      {},
      '',
      Object.assign(new Error('占位'), { message: '' }),
      42,
    ]) {
      expect(describeError(value, FALLBACK_ZH)).toBe(FALLBACK_ZH)
    }
    await i18n.changeLanguage('en')
    expect(describeError(undefined, FALLBACK_EN)).toBe(FALLBACK_EN)
  })
})

describe('按错误码判断是哪一种失败', () => {
  it('识别 UserError 与编码过的文字', () => {
    const error = new UserError('demo.http', '接口返回 503')
    expect(hasErrorCode(error, 'demo.http')).toBe(true)
    expect(hasErrorCode(encodeUserError(error), 'demo.http')).toBe(true)
    expect(hasErrorCode(error, 'demo.other')).toBe(false)
    expect(hasErrorCode(new Error('接口返回 503'), 'demo.http')).toBe(false)
  })
})

describe('真实错误类型在英文界面下的显示', () => {
  const HAN = /\p{Script=Han}/u
  const english = async (error: unknown, domain?: string) => {
    await i18n.changeLanguage('en')
    return describeError(error, FALLBACK_EN, domain ? { domain } : {})
  }

  it('网络视频：无效链接与无法访问各有英文文案', async () => {
    let invalid: unknown
    try {
      validateRemoteUrl('ftp://example.com/a.mkv')
    } catch (error) {
      invalid = error
    }
    expect(invalid).toBeInstanceOf(RemoteMediaError)
    // 简体中文保持原来的说明
    expect(describeError(invalid, FALLBACK_ZH, { domain: 'remoteMedia' })).toMatch(HAN)
    const text = await english(invalid, 'remoteMedia')
    expect(text).not.toBe(FALLBACK_EN)
    expect(text).not.toMatch(HAN)
    // 加载状态机里的失败只剩 code 与 message 两个字段
    const state = { code: 'access', message: '视频链接无法访问，请检查地址或更换链接' }
    expect(await english(state, 'remoteMedia')).not.toMatch(HAN)
    expect(await english(state, 'remoteMedia')).not.toBe(FALLBACK_EN)
  })

  it('本地弹幕：格式不对、没有内容、重复来源', async () => {
    for (const error of [
      new LocalDanmakuValidationError('invalid_format', '弹幕格式不正确'),
      new LocalDanmakuValidationError('empty', '文件中没有可导入的弹幕'),
      new LocalDanmakuImportError('duplicate', '已经添加过该来源'),
      new UserError('localDanmaku.save_failed', '保存弹幕失败，请检查存储空间后重试'),
    ]) {
      const text = await english(error, 'localDanmaku')
      expect(text).not.toBe(FALLBACK_EN)
      expect(text).not.toMatch(HAN)
    }
  })

  it('下载任务保存下来的失败原因：切换语言后按新的语言显示', async () => {
    const saved = encodeUserError({
      code: 'downloads.name_conflict',
      message: '保存目录中已存在「第 1 集.mkv」，请选择其他保存目录',
      params: { name: '第 1 集.mkv' },
    })
    expect(describeError(saved, FALLBACK_ZH)).toBe(
      '保存目录中已存在「第 1 集.mkv」，请选择其他保存目录',
    )
    const text = await english(saved)
    // 文件名是用户数据，原样带进英文文案
    expect(text).toContain('第 1 集.mkv')
    expect(text.replace('第 1 集.mkv', '')).not.toMatch(HAN)
  })

  it('旧版本保存的纯中文失败原因：简体中文按原文显示，英文显示概括', async () => {
    expect(describeError('下载进程已退出，请重试', FALLBACK_ZH)).toBe('下载进程已退出，请重试')
    expect(await english('下载进程已退出，请重试')).toBe(FALLBACK_EN)
  })
})
