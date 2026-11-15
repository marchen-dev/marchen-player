/**
 * 禁止在代码里直接写中文界面文字。
 *
 * 界面文案统一放在 packages/i18n，组件里用 useTranslation、组件外用 t() 取用。
 * 这条规则在生效范围内报告 JSX 文本、字符串与模板字符串里的汉字，
 * 防止已经迁移的界面重新混进写死的中文。生效范围与豁免名单见 eslint.config.mjs。
 *
 * 不受限制的：注释；日志（console、writeLog 等）与 Error 的参数——它们是给开发者看的，保持中文。
 */

const HAN = /\p{Script=Han}/u

/** 这些对象上的方法调用视为日志 */
const LOG_OBJECTS = new Set(['console', 'logger', 'log'])
/** 这些函数调用视为日志 */
const LOG_FUNCTIONS = new Set(['writeLog', 'writeLocalLog'])
/** 任意对象上的这些方法视为日志，例如 telemetry.log(...) */
const LOG_METHODS = new Set(['log'])

const isLogCall = (node) => {
  const { callee } = node
  if (callee.type === 'Identifier') return LOG_FUNCTIONS.has(callee.name)
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
  if (LOG_METHODS.has(callee.property.name)) return true
  return callee.object.type === 'Identifier' && LOG_OBJECTS.has(callee.object.name)
}

const isErrorConstruction = (node) =>
  node.callee.type === 'Identifier' && node.callee.name.endsWith('Error')

/** 从节点往上找：处在日志调用、Error 构造或 throw 里的文字是给开发者看的 */
const isDeveloperFacing = (node) => {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'ThrowStatement') return true
    if (current.type === 'CallExpression' && (isLogCall(current) || isErrorConstruction(current)))
      return true
    if (current.type === 'NewExpression' && isErrorConstruction(current)) return true
    // 到函数或语句边界为止，不把外层调用的豁免带进回调里
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'ExpressionStatement' ||
      current.type === 'VariableDeclaration'
    )
      return false
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止直接写中文界面文字，应放进 packages/i18n 并通过 t() 取用',
    },
    schema: [],
    messages: {
      hardcoded:
        '不要直接写中文界面文字：把文案放进 packages/i18n 的 locales，组件里用 useTranslation、组件外用 t() 取用。',
    },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'hardcoded' })
    return {
      JSXText(node) {
        if (HAN.test(node.value)) report(node)
      },
      Literal(node) {
        if (typeof node.value === 'string' && HAN.test(node.value) && !isDeveloperFacing(node))
          report(node)
      },
      TemplateElement(node) {
        if (HAN.test(node.value.raw) && !isDeveloperFacing(node)) report(node)
      },
    }
  },
}

export default rule
