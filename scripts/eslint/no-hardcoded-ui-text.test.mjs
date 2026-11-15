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
    // 日志调用里的回调不继承豁免
    { code: `console.log(items.map(() => <b>标题</b>))`, errors: [error] },
    // 同一个文件里多处都要报
    { code: `const a = '甲'\nconst b = <i>乙</i>`, errors: [error, error] },
  ],
})
