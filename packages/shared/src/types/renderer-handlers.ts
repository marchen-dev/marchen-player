/**
 * Renderer 端事件处理器接口
 *
 * 定义了 main 进程可以向 renderer 进程推送的所有事件类型。
 * 被 main 端的 createEmitter 和 renderer 端的 createListener 共同引用，
 * 确保事件发送和监听的类型一致性。
 *
 * 事件流向：main → renderer（单向推送）
 */
export const APP_SETTINGS_SECTIONS = ['general', 'ai', 'about'] as const

export type AppSettingsSection = (typeof APP_SETTINGS_SECTIONS)[number]

export const DEFAULT_APP_SETTINGS_SECTION: AppSettingsSection = 'general'

/** 将外部事件中的未知分类安全收敛到应用设置支持的稳定 ID。 */
export const resolveAppSettingsSection = (value?: unknown): AppSettingsSection =>
  typeof value === 'string' && APP_SETTINGS_SECTIONS.includes(value as AppSettingsSection)
    ? (value as AppSettingsSection)
    : DEFAULT_APP_SETTINGS_SECTION

export interface RendererHandlers {
  /** 打开应用设置，可选指定稳定分类 ID。 */
  showSetting: (section?: AppSettingsSection) => void

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
