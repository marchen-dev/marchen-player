/**
 * 全局 z-index 层级体系
 *
 * 与 src/renderer/src/styles/shadcn.css 中的 CSS 变量保持同步。
 * 修改这里的值时，请同步修改 CSS 变量。
 *
 * 层级由低到高：
 * - base/sticky/dropdown/header/overlay：基础 UI 层
 * - modalStack：自定义 ModalStack 栈（实际值 = modalStack + stackIndex）
 * - dialog：shadcn Dialog（嵌套在 ModalStack 内时覆盖其上）
 * - popover：Popover / Select 下拉（嵌套在 Dialog 内时覆盖其上）
 * - tooltip：Tooltip 提示
 * - toast：Toast 通知（永远最上层）
 */
export const Z_INDEX = {
  base: 0,
  sticky: 20,
  dropdown: 30,
  header: 40,
  overlay: 50,
  modalStack: 100,
  dialog: 200,
  popover: 250,
  tooltip: 280,
  toast: 300,
} as const

export type ZIndexKey = keyof typeof Z_INDEX
