/** 主进程显示的文案：macOS 应用菜单、系统对话框、文件选择对话框、更新流程提示 */
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
  /** 系统对话框 */
  dialog: {
    clearDataConfirm: '这个行为会清除 APP 全部数据，包括历史记录和设置，确定要继续吗？',
    clearDataOk: '确定',
    clearDataFailed: '清除失败，请检查磁盘空间和权限后重试',
    downloadsQuitConfirm: '还有未完成的下载任务，退出后将停止，重新打开可恢复。',
    quit: '退出',
    downloadsSaveFailed: '下载任务保存失败，暂未退出，请检查磁盘后重试。',
  },
  /** 文件选择对话框里的文件类型名称 */
  fileDialog: {
    video: '视频文件',
    subtitle: '字幕文件',
    torrent: 'BT 种子',
  },
  /** 安装更新与退出时的提示 */
  update: {
    installIncomplete: '尚未完成更新安装，请重试',
    later: '稍后',
    retryInstall: '重试保存并安装',
    closeBlocked: '播放进度未保存，暂未关闭',
    quitBlocked: '播放进度未保存，暂未退出',
    unavailable: '应用内更新暂不可用',
    unavailableDetail: '请到发布页手动下载新版。',
    openDownloadPage: '前往下载',
    devMode: '开发模式不检查更新',
    noNotes: '暂无更新说明',
  },
  downloads: {
    /** 下载子进程在系统活动监视器里显示的名称 */
    serviceName: 'Marchen 下载',
    /** 链接里取不到文件名时的默认文件名 */
    defaultName: '下载-{{id}}',
  },
  /** 从视频页面链接读取弹幕时生成的标题 */
  danmakuLink: {
    bilibiliSeason: 'B 站番剧',
    bilibiliEpisode: '{{season}} · 第 {{episode}} 集 {{title}}',
  },
} as const
