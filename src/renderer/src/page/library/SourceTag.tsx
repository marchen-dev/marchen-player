import type { FC } from 'react'
import type { LibrarySource } from './selectors'

const SOURCE_META: Record<LibrarySource, { icon: string; label: string }> = {
  local: { icon: 'icon-[mingcute--computer-line]', label: '本地' },
  remote: { icon: 'icon-[mingcute--cloud-line]', label: '远程' },
  mixed: { icon: 'icon-[mingcute--cloud-line]', label: '本地 + 远程' },
}

/** 卡片副标题中的媒体来源标记，区分本地文件与远程 URL 播放 */
export const SourceTag: FC<{ source: LibrarySource }> = ({ source }) => {
  const { icon, label } = SOURCE_META[source]
  return (
    <span className="inline-flex items-center gap-1">
      <i className={`${icon} size-3`} aria-hidden />
      {label}
    </span>
  )
}
