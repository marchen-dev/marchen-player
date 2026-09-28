import type { Target, TargetAndTransition, Transition } from 'framer-motion'

/**
 * 弹窗统一视觉 token
 *
 * shadcn Dialog（受控表单弹窗）与 ModalStack（命令式弹窗）共用同一套遮罩与开关动画，
 * 保证两类弹窗观感一致。CSS 动画侧的 keyframes 定义在 styles/tailwind.css（dialog-in / dialog-out），
 * 修改这里的时长或曲线时请同步修改。
 */

/** 减速曲线：起步快、收尾柔和，避免弹簧回弹带来的“塑料感” */
export const DIALOG_EASE_OUT = [0.16, 1, 0.3, 1] as const

/** 进场 180ms、退场 120ms：关闭比打开更快，减少等待感 */
export const DIALOG_ENTER_DURATION = 0.18
export const DIALOG_EXIT_DURATION = 0.12

/**
 * 遮罩：深色半透明 + 轻微模糊
 * 弹窗常覆盖在播放中的视频上，深色能压住画面；模糊半径保持很小，降低视频逐帧重绘时的 GPU 开销。
 */
export const DIALOG_OVERLAY_CLASS_NAME = 'bg-black/40 backdrop-blur-[2px] dark:bg-black/60'

const hiddenStyle: Target = { opacity: 0, scale: 0.96, y: 4 }
const visibleStyle: Target = { opacity: 1, scale: 1, y: 0 }

export const dialogEnterTransition: Transition = {
  duration: DIALOG_ENTER_DURATION,
  ease: DIALOG_EASE_OUT,
}

const dialogExitTransition: Transition = {
  duration: DIALOG_EXIT_DURATION,
  ease: 'easeIn',
}

interface DialogMotionConfig {
  initial: Target
  animate: TargetAndTransition
  exit: TargetAndTransition
}

/** framer-motion 版本的面板进退场参数，退场只淡出并轻微缩小，不做位移 */
export const dialogMotionConfig = {
  initial: hiddenStyle,
  animate: { ...visibleStyle, transition: dialogEnterTransition },
  exit: { opacity: 0, scale: 0.98, transition: dialogExitTransition },
} satisfies DialogMotionConfig

/** framer-motion 版本的遮罩淡入淡出 */
export const dialogOverlayMotionConfig = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: dialogEnterTransition },
  exit: { opacity: 0, transition: dialogExitTransition },
} satisfies DialogMotionConfig
