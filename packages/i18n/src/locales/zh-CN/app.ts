/** 应用外壳：侧栏与页面标题、全局提示、网络与更新提示、反馈弹窗、桌面客户端推荐、错误页 */
export default {
  /** 侧栏导航与页头标题 */
  routes: {
    player: '视频播放',
    library: '影视库',
    mediaSources: '媒体源',
    downloads: '下载',
  },
  sidebar: {
    settings: '设置',
  },
  logoAlt: 'Marchen 应用图标',
  errorPage: {
    title: '糟糕发生错误了😭',
    messageLabel: '错误信息:',
    reload: '重新加载页面',
  },
  /** 弹窗没有提供说明时读屏用的兜底说明 */
  modalFallbackDescription: '弹窗内容',
  network: {
    offlineTitle: '网络异常',
    offlineDescription: '请检查网络连接',
  },
  request: {
    forbidden: '接口请求被拒绝，请联系开发者 - {{url}}',
    failed: '接口请求失败',
  },
  update: {
    readyTitle: '新版本已准备好',
    readyDescription: '可以在关于页查看更新并选择安装。',
    view: '查看更新',
    updatedTitle: '已更新至 {{version}}',
    updatedDescription: '当前已运行新版本。',
    viewNotes: '查看更新内容',
    viewNotesAlt: '在浏览器中查看此版本的更新内容',
    /** 安装更新前保存播放进度失败，由主进程显示在对话框里 */
    saveFailed: '播放进度保存失败，请重试',
  },
  reset: {
    successTitle: '重置成功',
    successDescription: '网页将在 3 秒后重新加载',
  },
  /** 「在系统文件管理器中定位文件」，各平台叫法不同 */
  revealInFileManager: {
    mac: '在 Finder 中显示',
    windows: '在资源管理器中显示',
    other: '在文件管理器中显示',
  },
  storageNotice: {
    title: '播放存储已更新',
    description: '本版本使用新的播放记录和媒体库，旧版本数据保留，不会自动导入。',
  },
  titlebar: {
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原窗口',
    close: '关闭窗口',
  },
  dropZone: {
    release: '释放以打开视频',
  },
  /** 网页端首次访问时推荐桌面客户端 */
  desktopPromo: {
    title: '下载桌面客户端',
    subtitle: 'macOS、Windows、Linux 均可免费使用，比网页版多出：',
    advantages: {
      mediaSources: '连接 Jellyfin、Emby、WebDAV，直接浏览播放',
      remote: '通过 URL 播放视频直链，下载磁力与 BT 资源',
      local: '自动发现同目录的字幕和下一集，记录可直接续播',
    },
    later: '以后再说',
    download: '下载客户端',
  },
  /** 手机浏览器访问时的提示 */
  mobileNotice: {
    title: '请在电脑上打开',
    description:
      'Marchen Player 目前只为电脑浏览器和桌面客户端设计，手机上无法正常拖入视频和操作播放器。',
    share: '分享链接到电脑',
    continue: '仍要继续访问',
    copiedTitle: '链接已复制',
    copiedDescription: '在电脑浏览器中打开即可使用',
  },
  feedback: {
    title: '反馈问题',
    description: '描述遇到的问题，我们会结合诊断信息排查',
    messageLabel: '遇到了什么问题？',
    messagePlaceholder: '例如：打开某个 MKV 视频时提示无法解码…',
    contactLabel: '联系方式（可选）',
    contactPlaceholder: '邮箱或 Telegram',
    attachLogs: '附带诊断日志',
    attachLogsDescription: '包含应用版本、系统信息与最近的操作记录',
    send: '发送',
    sending: '发送中…',
    sendAnyway: '仍要发送',
    confirmRepeat: '刚刚已发送过反馈，确定再发一次？',
    success: '已收到你的反馈，感谢！',
    referenceLabel: '反馈编号',
    referenceHint: '在 GitHub 或邮件中提及该编号，便于定位问题',
    referenceCopied: '已复制反馈编号',
    unavailable: '当前无法在线发送反馈，可以通过以下方式手动联系：',
    copyDiagnostics: '复制诊断信息',
    diagnosticsCopied: '已复制诊断信息',
    openLogs: '打开日志目录',
    copyEmail: '复制邮箱',
    emailCopied: '已复制邮箱',
    failed: {
      timeout: '发送超时，请检查网络后重试。',
      blocked: '发送失败，可能被浏览器扩展拦截，可重试或手动联系。',
      other: '发送失败，可重试或手动联系。',
    },
  },
} as const
