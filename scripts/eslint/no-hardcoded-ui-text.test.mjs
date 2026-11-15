import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './no-hardcoded-ui-text.mjs'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const error = { messageId: 'hardcoded' }

tester.run('no-hardcoded-ui-text', rule, {
  valid: [
    // 走文案包
    `const view = <span>{t('dialog.title')}</span>`,
    `toast({ title: t('settings:general.data.items.danmaku.cleared') })`,
    // 半角标点与英文拼接不受影响
    `const text = warnings.join('; ') + ' (' + count + ')'`,
    // 英文字面量、类名、标识不受影响
    `const view = <div className="app-settings">Marchen</div>`,
    `const labels = { cloudflare: 'Cloudflare' }`,
    // 注释
    `// 这是注释\nconst a = 1\n/* 块注释 */`,
    `const view = <div>{/* JSX 里的注释 */}</div>`,
    // 日志与错误是给开发者看的
    `console.warn('[i18n] 读取系统语言失败', error)`,
    `console.error(\`保存失败：\${reason}\`)`,
    `writeLog({ lv: 'warn', cat: 'app', msg: '写入失败' })`,
    `telemetry.log({ level: 'warning', message: '已降级继续播放' })`,
    `throw new Error('翻译引擎尚未初始化')`,
    `const failure = new TranslationAssetError('assets_network', '下载失败')`,
    `throw fail('不支持的格式')`,
    `controller.abort(new DOMException('接口请求超时', 'TimeoutError'))`,
    `class SeekError extends Error { constructor() { super('弹幕恢复未能及时追上媒体时间') } }`,
    // 带错误码的错误对象：细节留给日志，界面按错误码取文案
    `const error = { code: 'decode', message: '当前环境无法解码该媒体', recoverable: false }`,
    `runtime.fail({ code: 'network', message: error instanceof Error ? error.message : '媒体读取失败' })`,
    `const result = { kind: 'unsupported', code: 'encrypted', reason: '暂不支持加密字幕轨' }`,
    // 正则里的汉字不是界面文字
    `const HAN = /[\\u4e00-\\u9fff]/`,
  ],
  invalid: [
    { code: `const view = <span>设置</span>`, errors: [error] },
    { code: `const view = <Row label="开机自启" />`, errors: [error] },
    { code: `const view = <Row label={'开机自启'} />`, errors: [error] },
    { code: `toast({ title: '已清除弹幕缓存' })`, errors: [error] },
    { code: `const title = \`已清除\${label}\``, errors: [error] },
    { code: `const options = [{ value: 'auto', label: '自动' }]`, errors: [error] },
    // 没有汉字的中文标点同样是残留的中文：拼接用的分隔符要按语言取
    { code: `const text = warnings.join('；')`, errors: [error] },
    { code: `const text = title + '：' + detail`, errors: [error] },
    { code: `const view = <span>（{count}）</span>`, errors: [error, error] },
    // 以 Error 结尾的状态更新函数传的是界面文字
    { code: `setError('偏移无效')`, errors: [error] },
    { code: `setError(cause instanceof Error ? cause.message : '音轨切换失败')`, errors: [error] },
    // 没有错误码的对象里的 message 仍然算界面文字
    { code: `publish({ status: 'error', message: '请先打开视频' })`, errors: [error] },
    // 有错误码也只放行 message / reason，其他字段照查
    { code: `const row = { code: 'x', label: '视频解码' }`, errors: [error] },
    // 日志调用里的回调不继承豁免
    { code: `console.log(items.map(() => <b>标题</b>))`, errors: [error] },
    // 同一个文件里多处都要报
    { code: `const a = '甲'\nconst b = <i>乙</i>`, errors: [error, error] },
  ],
})
