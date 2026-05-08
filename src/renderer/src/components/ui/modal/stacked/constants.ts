import type { motion, Target, Transition } from 'framer-motion'
import type { ComponentProps } from 'react'
import { Z_INDEX } from '@renderer/lib/constants/z-index'

const enterStyle: Target = {
  scale: 1,
  opacity: 1,
}

const initialStyle: Target = {
  scale: 0.96,
  opacity: 0,
}

export const microReboundPreset: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
}

type ModalMotionConfig = ComponentProps<typeof motion.div>

export const modalMotionConfig: ModalMotionConfig = {
  initial: initialStyle,
  animate: enterStyle,
  exit: initialStyle,
  transition: microReboundPreset,
}

export const MODAL_STACK_Z_INDEX = Z_INDEX.modalStack
