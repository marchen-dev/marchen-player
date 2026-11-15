/**
 * 禁止在代码里直接写中文界面文字。
 *
 * 界面文案统一放在 packages/i18n，组件里用 useTranslation、组件外用 t() 取用。
 * 这条规则在生效范围内报告 JSX 文本、字符串与模板字符串里的汉字与中文标点，
 * 防止已经迁移的界面重新混进写死的中文。生效范围与豁免名单见 eslint.config.mjs。
 *
 * 不受限制的：注释；日志（console、writeLog 等）与 Error 的参数——它们是给开发者看的，保持中文。
 */

/**
 * 汉字，以及中文标点与全角符号（、。「」【】，：；（）等）。
 * 标点也算：`items.join('；')`、`title + '：' + detail` 这类拼接里没有汉字，
 * 但换成英文界面后同样是残留的中文。
 */
const HAN =
  /[\p{Script=Han}\u3001-\u3003\u3008-\u3011\u3014-\u301F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/u

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

/**
 * `new XxxError(...)`、`new DOMException(...)`、`Error(...)`，以及错误子类构造函数里的 `super(...)`：
 * 错误对象的文字是给开发者看的。
 * 只认大写开头的类名：`setError('…')` 这类状态更新函数传的是界面文字，不能放行。
 */
const isErrorConstruction = (node) =>
  node.callee.type === 'Super' ||
  (node.callee.type === 'Identifier' && /^(?:[A-Z]\w*)?(?:Error|Exception)$/.test(node.callee.name))

const propertyName = (property) =>
  property.type === 'Property' && !property.computed
    ? property.key.type === 'Identifier'
      ? property.key.name
      : property.key.value
    : undefined

/** 值表达式内部可以穿过的节点：`cond ? a : '文字'`、`a || '文字'`、模板字符串 */
const VALUE_WRAPPERS = new Set([
  'ConditionalExpression',
  'LogicalExpression',
  'TemplateLiteral',
  'BinaryExpression',
])

/**
 * 带错误码的错误对象：`{ code: 'decode', message: '当前环境无法解码该媒体' }`。
 * 界面按 `code` 取对应语言的文案（见 renderer 的 describeError），`message` / `reason`
 * 是保留给日志的简体中文细节，不算界面文字。
 */
const isErrorPayloadDetail = (node) => {
  let current = node.parent
  while (current && VALUE_WRAPPERS.has(current.type)) current = current.parent
  if (!current || current.type !== 'Property') return false
  const name = propertyName(current)
  if (name !== 'message' && name !== 'reason') return false
  const object = current.parent
  return (
    object?.type === 'ObjectExpression' &&
    object.properties.some((property) => propertyName(property) === 'code')
  )
}

/** 从节点往上找：处在日志调用、Error 构造或 throw 里的文字是给开发者看的 */
const isDeveloperFacing = (node) => {
  if (isErrorPayloadDetail(node)) return true
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
