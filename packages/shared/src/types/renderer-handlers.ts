/**
 * Renderer 端事件处理器接口
 *
 * 定义了 main 进程可以向 renderer 进程推送的所有事件类型。
 * 被 main 端的 createEmitter 和 renderer 端的 createListener 共同引用，
 * 确保事件发送和监听的类型一致性。
 *
 * 事件流向：main → renderer（单向推送）
 */
export interface RendererHandlers {
  /** 打开设置面板，可选指定要显示的 tab 名称 */
  showSetting: (tab?: string) => void

  /** 通知 renderer 导入动画文件（如通过系统文件关联或拖拽打开） */
  importAnime: (params?: { path: string }) => void

  /** 推送更新日志文本，用于在 renderer 端显示更新成功提示 */
  getReleaseNotes: (text: string) => void

  /** 推送应用更新进度（下载/安装阶段） */
  updateProgress: (params: { progress: number; status: 'downloading' | 'installing' }) => void

  /** 推送窗口状态变化事件（全屏、最大化等） */
  windowAction: (
    action: 'enter-full-screen' | 'leave-full-screen' | 'maximize' | 'unmaximize',
  ) => void
}
