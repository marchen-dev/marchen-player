import type { motion, Spring, Target, Transition } from 'framer-motion'
import type { ComponentProps } from 'react'

const enterStyle: Target = {
  scale: 1,
  opacity: 1,
}

const initialStyle: Target = {
  scale: 0.96,
  opacity: 0,
}

export const microReboundPreset: Spring = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
}

type ModalMotionConfig = ComponentProps<typeof motion.div>

export const modalMotionConfig: ModalMotionConfig = {
  initial: initialStyle,
  animate: enterStyle,
  exit: initialStyle,
  transition: microReboundPreset as Transition, // 明确类型转换
}

export const MODAL_STACK_Z_INDEX = 100
