import type { FC } from 'react'
import type { LibrarySource } from './selectors'
import { useTranslation } from 'react-i18next'

// 名称在渲染时取 library 命名空间的 `source.<来源>`，不放在这个模块顶层的常量里
const SOURCE_ICONS: Record<LibrarySource, string> = {
  local: 'icon-[mingcute--computer-line]',
  remote: 'icon-[mingcute--cloud-line]',
  mixed: 'icon-[mingcute--cloud-line]',
}

/** 卡片副标题中的媒体来源标记，区分本地文件与远程 URL 播放 */
export const SourceTag: FC<{ source: LibrarySource }> = ({ source }) => {
  const { t } = useTranslation('library')
  return (
    <span className="inline-flex items-center gap-1">
      <i className={`${SOURCE_ICONS[source]} size-3`} aria-hidden />
      {t(`source.${source}`)}
    </span>
  )
}
