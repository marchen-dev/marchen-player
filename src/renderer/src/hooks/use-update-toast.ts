import { updateProgressAtom } from '@renderer/atoms/progress'
import { useAppSettingsValue } from '@renderer/atoms/settings/app'
import { Button } from '@renderer/components/ui/button'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { getStorageNS } from '@renderer/lib/ns'
import { isWeb } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import { createElement, useEffect, useRef } from 'react'

/**
 * 全局更新进度 toast 适配器。
 *
 * 替代旧 sidebar 内 `UpdateProgress` 的进度条 / 安装按钮 UI。
 *
 * `updateProgressAtom` 在本项目中的两个语义状态（见 atoms/progress.ts）：
 *  - 'downloading'：正在下载，progress 为百分比
 *  - 'installing'：下载完成 + 等待用户点击安装（旧 UI 显示 Install 按钮）
 *
 * 行为：
 *  - downloading：弹一条持续 toast，标题「正在下载新版本」，描述含 N%。
 *    progress 数值变化时调用 `update()` 修改同一条 toast 而非反复弹新条
 *  - installing：dismiss 进度 toast，弹新 toast 含「安装新版本」action 按钮
 *  - atom 变为 null：dismiss 当前 toast
 *  - 仅在 Electron 挂载（Web 无 auto-update）
 *
 * 应在应用根级挂载一次。
 */
export function useUpdateToast() {
  const update = useAtomValue(updateProgressAtom)
  const appSettings = useAppSettingsValue()
  // 保存当前 toast 的句柄；null 表示当前未挂任何更新 toast。
  // 同时记录当前 toast 对应的 status，便于判断"换不同 toast"还是"更新进度数字"。
  const toastRef = useRef<{
    id: string
    dismiss: () => void
    update: (props: Parameters<ReturnType<typeof toast>['update']>[0]) => void
    status: 'downloading' | 'installing'
  } | null>(null)

  useEffect(() => {
    if (isWeb) return

    // atom 为 null（无更新事件）→ 清掉残留 toast
    if (!update) {
      toastRef.current?.dismiss()
      toastRef.current = null
      return
    }

    if (update.status === 'downloading') {
      const description = `${update.progress || 0}%`
      // 已有 downloading toast → update 内容；否则新建
      if (toastRef.current?.status === 'downloading') {
        toastRef.current.update({
          id: toastRef.current.id,
          title: '正在下载新版本',
          description,
        })
      } else {
        toastRef.current?.dismiss()
        const t = toast({
          title: '正在下载新版本',
          description,
        })
        toastRef.current = { ...t, status: 'downloading' }
      }
      return
    }

    if (update.status === 'installing') {
      // 已经是 installing 态的 toast → 不重复弹
      if (toastRef.current?.status === 'installing') return
      toastRef.current?.dismiss()

      // 复用旧 UpdateProgress 的安装逻辑：
      //   1. 先把 showUpdateNote: true 写入 localStorage（installUpdate 会立即
      //      退出程序并安装，所以这里只能用同步 localStorage，atom 异步更新来不及）
      //   2. 调 ipcClient?.app.installUpdate()
      const onInstall = () => {
        localStorage.setItem(
          getStorageNS('app'),
          JSON.stringify({ ...appSettings, showUpdateNote: true }),
        )
        ipcClient?.app.installUpdate()
      }

      const t = toast({
        title: '新版本已就绪',
        description: '点击右侧按钮立即安装并重启',
        action: createElement(
          Button,
          { variant: 'outline', size: 'sm', onClick: onInstall },
          '安装新版本',
        ) as never,
      })
      toastRef.current = { ...t, status: 'installing' }
    }
  }, [update, appSettings])

  // 卸载时清理（HMR 期间避免残留）
  useEffect(() => {
    return () => {
      toastRef.current?.dismiss()
      toastRef.current = null
    }
  }, [])
}
