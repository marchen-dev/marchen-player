import type { FC, HTMLAttributes, PropsWithChildren } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { hasDraggedFiles } from './video-drop-utils'

type VideoDropZoneProps = PropsWithChildren<
  Omit<HTMLAttributes<HTMLDivElement>, 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'> & {
    active?: boolean
    onFileDrop: (file: File) => void
  }
>

/**
 * 播放器与影视库共用的视频拖拽区域。
 *
 * 用进入深度抵消子节点间 dragenter / dragleave 的冒泡抖动；格式判断和后续导航
 * 仍由使用方负责，使该组件只表达拖拽交互而不侵入播放器业务。
 */
export const VideoDropZone: FC<VideoDropZoneProps> = ({
  active = true,
  children,
  className,
  onFileDrop,
  ...props
}) => {
  const rootClassName = ['relative', className].filter(Boolean).join(' ')

  if (!active) {
    return (
      <div {...props} className={rootClassName} data-video-drop-zone>
        {children}
      </div>
    )
  }

  return (
    <ActiveVideoDropZone {...props} className={rootClassName} onFileDrop={onFileDrop}>
      {children}
    </ActiveVideoDropZone>
  )
}

const ActiveVideoDropZone: FC<Omit<VideoDropZoneProps, 'active'>> = ({
  children,
  className,
  onFileDrop,
  ...props
}) => {
  const dragDepthRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)

  const clearDragging = useCallback(() => {
    dragDepthRef.current = 0
    setIsDragging(false)
  }, [])

  useEffect(() => () => void (dragDepthRef.current = 0), [])

  return (
    <div
      {...props}
      className={className}
      data-video-drop-zone
      data-dragging={isDragging || undefined}
      onDragEnter={(event) => {
        if (!hasDraggedFiles(event.dataTransfer.types)) return
        event.preventDefault()
        dragDepthRef.current += 1
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        if (!isDragging) return
        event.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setIsDragging(false)
      }}
      onDragOver={(event) => {
        if (!hasDraggedFiles(event.dataTransfer.types)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        clearDragging()
        if (file) onFileDrop(file)
      }}
    >
      {children}
      {isDragging && <VideoDropOverlay />}
    </div>
  )
}

const VideoDropOverlay: FC = () => (
  <div
    className="border-foreground/30 bg-background/95 text-foreground pointer-events-none absolute inset-4 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed shadow-sm"
    role="status"
    aria-live="polite"
  >
    <span
      className="bg-muted text-foreground grid size-12 place-items-center rounded-[10px]"
      aria-hidden="true"
    >
      <i className="icon-[mingcute--download-2-line] text-2xl" />
    </span>
    <strong className="mt-2 text-lg font-semibold">释放以打开视频</strong>
  </div>
)
