/** 主进程显示的文案。目前只有 macOS 应用菜单；系统对话框与更新提示在后续变更迁入 */
export default {
  menu: {
    about: '关于 {{appName}}',
    checkForUpdates: '检查更新…',
    feedback: '反馈问题…',
    settings: '设置...',
    services: '服务',
    hide: '隐藏 {{appName}}',
    hideOthers: '隐藏其他',
    clearData: '清除数据',
    quit: '退出 {{appName}}',
    importAnime: '导入动漫',
    close: '关闭',
  },
} as const
