/** 设置弹窗：外壳、通用、实验室、关于，以及这些页面用到的共享设置项 */
export default {
  dialog: {
    title: '设置',
    description: '管理 Marchen 的应用偏好、实验功能与版本信息',
    navigationLabel: '设置分类',
    close: '关闭设置',
  },
  /** 左侧分类导航；description 同时是对应页面标题下的说明 */
  tabs: {
    general: { label: '通用', description: '管理应用行为、外观与本地数据' },
    downloads: { label: '下载', description: '管理下载目录与传输设置' },
    labs: { label: '实验室', description: '抢先体验仍在开发中的功能' },
    about: { label: '关于', description: '查看版本、更新与反馈渠道' },
  },
  general: {
    app: {
      title: '应用',
      launchAtLogin: {
        label: '开机自启',
        description: '登录系统后自动启动 Marchen',
      },
    },
    appearance: {
      title: '外观',
      theme: {
        label: '主题',
        description: '跟随系统，或固定使用白天与夜间外观',
        ariaLabel: '主题偏好',
        options: { system: '系统', light: '白天', dark: '夜间' },
      },
      language: {
        label: '语言',
        description: '界面显示的语言',
        /** 下拉框里的「跟随系统」；具体语言显示它们的自称名，不在这里 */
        system: '跟随系统',
      },
    },
    playback: {
      title: '播放',
      playFirst: {
        label: '优先播放视频',
        description: '先播放视频，弹幕在后台加载完成后接入；开头可能缺少弹幕',
      },
    },
    network: {
      title: '网络',
      apiRoute: {
        label: 'API 线路',
        current: '当前线路：{{route}}',
        /** 自动模式下的当前线路由实测结果决定，标注出来避免误认为是用户选的 */
        currentAuto: '当前线路：{{route}}（自动选择）',
        auto: '自动（推荐）',
      },
    },
    data: {
      title: '数据',
      calculating: '计算中…',
      size: '约 {{size}}',
      items: {
        danmaku: {
          label: '弹幕缓存',
          description: '下次播放时重新获取，导入的弹幕会保留',
          cleared: '已清除弹幕缓存',
          failed: '清除弹幕缓存失败',
        },
        thumbnail: {
          label: '播放缩略图',
          description: '继续观看改用作品海报',
          cleared: '已清除播放缩略图',
          failed: '清除播放缩略图失败',
        },
        network: {
          label: '网络缓存',
          description: '海报等图片，需要时重新下载',
          cleared: '已清除网络缓存',
          failed: '清除网络缓存失败',
        },
        translation: {
          label: '翻译模型',
          description: '弹幕翻译使用的引擎与模型；清除后弹幕翻译会关闭',
          cleared: '已清除翻译模型',
          failed: '清除翻译模型失败',
        },
      },
      reset: {
        label: '重置应用',
        description: '清除任务、记录与设置，保留视频文件',
        confirm: '确定重置应用？此操作无法撤销。',
      },
    },
  },
  /** 播放内核：应用设置与播放器面板共用同一份选项与状态文案 */
  playerEngine: {
    label: '播放内核',
    options: { auto: '自动', native: '原生（H5）', compat: '兼容内核' },
    status: {
      switching: '正在切换内核…',
      preparing: '正在准备播放…',
      current: '当前使用：{{engine}}',
      pending: '下次打开视频时应用；自动模式优先使用原生播放。',
    },
  },
  labs: {
    description: '抢先体验仍在开发中的功能，可能不稳定或随时调整',
    empty: '暂无可用的实验功能',
    playback: {
      title: '播放',
      description: '遇到问题可在「关于」中反馈',
    },
    remoteUrl: {
      label: '通过 URL 播放',
      description: '在首页显示“通过 URL 播放”，打开 HTTP/HTTPS 视频直链，来源需支持 Range 请求',
      /** 接在上一句后面：Web 直接从浏览器读取远端，受跨域策略约束 */
      descriptionWebSuffix: '；网页版还需来源允许跨域访问',
    },
  },
  about: {
    description: 'Marchen 的版本、更新与反馈渠道',
    currentVersion: '当前版本 {{version}}',
    checkUpdate: '检查更新',
    checking: '检查中…',
    update: {
      title: '软件更新',
      /** deb 等系统包由包管理器替换文件，应用内只提示新版本 */
      descriptionManual: '自动检查新版本；当前为系统安装包，请下载新版安装包后覆盖安装。',
      descriptionInApp: '自动检查并在后台下载新版本，由你决定何时安装。',
      phase: {
        idle: '尚未检查更新',
        checking: '正在检查更新…',
        upToDate: '当前已是最新版本',
        available: '发现新版本',
        downloading: '正在下载更新',
        preparing: '正在验证并准备更新…',
        ready: '新版本已准备好',
        installing: '正在保存进度并安装…',
        error: '更新失败',
      },
      download: '下载更新',
      install: '安装并重启',
      openDownloadPage: '前往下载页',
      progressLabel: '更新下载进度',
      estimating: '估算中',
      etaSeconds_other: '约 {{count}} 秒',
      etaMinutes_other: '约 {{count}} 分钟',
    },
    feedback: {
      title: '问题反馈',
      description: '欢迎提交问题、建议或参与项目讨论',
      diagnostic: {
        label: '发送诊断反馈',
        description: '附带本地日志，帮助定位播放、字幕或下载问题',
        action: '反馈问题…',
      },
      logs: {
        label: '日志位置',
        description: '本地诊断日志，最多保留约 15 MB',
        action: '打开目录',
      },
    },
  },
} as const
