'use client'

import { cn } from '@renderer/lib/utils'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast'
import { useToast } from './use-toast'

export function Toaster() {
  const { toasts } = useToast()
  const isPlaying = usePlayerLoadingSelector((s) => s.step === 'ready' || s.step === 'reloading')
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      {/*
        播放时 toast 浮在视频上：上移避免遮住进度条，并接入播放器的固定深色色板，
        不跟随应用主题（浅色主题下白色的提示块压在画面上很突兀）。
        全局 Toaster 挂在应用根部、不在播放器容器内，所以用属性显式接入。
      */}
      <ToastViewport
        data-player-theme={isPlaying ? '' : undefined}
        className={cn(isPlaying && 'dark sm:bottom-14')}
      />
    </ToastProvider>
  )
}
