import { Z_INDEX } from '@renderer/lib/constants/z-index'
import { dialogMotionConfig } from '../../dialog/visual'

/**
 * ModalStack 面板开关动画
 * 复用 shadcn Dialog 的统一视觉参数（减速曲线进场、快速淡出退场），替代原先回弹明显的弹簧。
 */
export const modalMotionConfig = dialogMotionConfig

export const MODAL_STACK_Z_INDEX = Z_INDEX.modalStack
