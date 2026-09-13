/** 只把系统文件拖拽识别为有效状态，不响应页面内部元素拖动。 */
export function hasDraggedFiles(types: readonly string[]): boolean {
  return types.includes('Files')
}
