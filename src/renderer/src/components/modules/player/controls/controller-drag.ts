const INTERACTIVE_DRAG_SELECTOR =
  'button, input, select, textarea, a, [role="slider"], [data-no-controller-drag], .no-drag-region'

/** 只让控制器的非交互空白区域启动拖动。 */
export const canStartControllerDrag = (target: EventTarget | null) => {
  if (!target || typeof (target as Element).closest !== 'function') return true
  return !(target as Element).closest(INTERACTIVE_DRAG_SELECTOR)
}
