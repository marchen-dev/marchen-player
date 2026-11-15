/** 播放器：首页、加载与匹配、播放记录。控制栏与设置侧栏的文案也在这个命名空间 */
export default {
  home: {
    dropHint: '点击或拖拽视频到此处播放',
    openFromMediaSource: '从媒体源打开',
    playFromUrl: '通过 URL 播放',
    history: '播放记录',
    invalidFormatTitle: '格式错误',
    invalidFormatDescription: '请选择 MP4、MKV、MOV、WebM 或 TS 等支持的视频文件',
  },
  loading: {
    progressLabel: '视频加载进度',
    status: {
      connecting: '正在连接视频来源…',
      reading: '正在读取视频…',
      hashing: '正在识别视频…',
      matching: '正在匹配番剧…',
      loadingDanmaku: '正在获取弹幕…',
      waitingUser: '请选择匹配的剧集',
      matchFailed: '匹配失败',
      matchFailedWithDetail: '匹配失败：{{detail}}',
    },
    /** 远程视频只读取开头的一段用于识别，这里是这一段的进度 */
    readPercent: '已读取识别片段 {{percent}}%',
    playNow: '直接播放',
    retryMatch: '重试匹配',
    manualMatch: '手动匹配',
    playFirst: '先播放，弹幕后台加载',
    remoteReading: '正在读取视频识别数据…',
    remoteProgressLabel: '视频识别数据读取进度',
  },
  /** 导入或识别阶段出错时的说明与操作 */
  loadFailure: {
    actions: {
      retry: '重试',
      change_link: '更换链接',
      reselect: '重新选择视频',
      open_source: '前往媒体源',
    },
    back: '返回',
    detail: '错误详情',
    feedback: '反馈问题',
    /** 预填进反馈弹窗的内容，用户可以继续编辑 */
    feedbackPrefill: '播放失败：{{title}}\n错误详情：{{detail}}\n',
    remote: {
      title: '无法打开视频链接',
      description: '链接可能已失效，请重试或更换链接',
    },
    local: {
      title: '无法打开视频文件',
      description: '文件可能已被移动、删除或无法读取',
    },
    provider: {
      unreachableTitle: '无法连接媒体源',
      unreachableDescription: '请检查服务器是否在线后重试',
      openFailedTitle: '无法打开媒体源视频',
      unplayableTitle: '无法播放此媒体源视频',
      /** 需要到媒体源页面处理的几种情况，键是媒体源的错误码 */
      titles: {
        auth_failed: '媒体源需要重新登录',
        forbidden: '没有访问权限',
        source_removed: '媒体源已被移除',
        not_found: '找不到这个视频',
      },
    },
  },
  /** 弹幕匹配与加载完成后，播放器右下角的提示 */
  matchToast: {
    title: {
      unmatched: '未精确匹配',
      matchFailed: '弹幕匹配失败',
      updateFailed: '弹幕更新失败',
      loadFailed: '已匹配，弹幕加载失败',
      automatic: '已自动匹配弹幕',
      updated: '已更新弹幕匹配',
    },
    hint: {
      unmatched: '点此手动匹配',
      playable: '视频可正常播放',
      /** total 是已经按界面语言加好千分位的数量 */
      loaded: '已加载 {{total}} 条弹幕',
    },
    action: {
      unmatched: '手动匹配',
      matchFailed: '重试匹配',
      failed: '重试弹幕',
      view: '查看',
    },
    actionAlt: {
      unmatched: '手动选择匹配的剧集',
      matchFailed: '重试匹配',
      failed: '重试弹幕加载',
      view: '在弹幕设置中查看完整匹配信息',
    },
    /**
     * 界面语言不是中文、用户还没对弹幕翻译做过选择时，加载完成的提示里问一次。
     * language 是目标语言自己的写法（如 English）
     */
    translate: {
      question: '要把弹幕翻译成 {{language}} 吗？',
      accept: '翻译',
      acceptAlt: '把弹幕翻译成 {{language}}',
      decline: '不用',
      declineAlt: '不翻译弹幕',
    },
    close: '关闭匹配提示',
    viewportLabel: '弹幕匹配提示',
  },
  remoteDialog: {
    titleNew: '通过 URL 播放',
    titleChange: '更换视频链接',
    urlLabel: '视频链接',
    urlPlaceholder: '粘贴视频链接',
    hint: '支持 HTTP / HTTPS 视频文件直链',
    openAsNew: '作为新视频打开',
    reading: '正在读取…',
    start: '开始播放',
    invalid: '链接无效',
  },
  matchDialog: {
    title: '选择弹幕',
    description: '搜索在线弹幕库并选择剧集',
    descriptionWithImport: '搜索在线弹幕库，或导入自己的弹幕文件',
    searchPlaceholder: '输入作品名称搜索',
    empty: '暂无匹配的弹幕库',
    selectedTitle: '已选择弹幕库',
    selectedDescription: '已选择 {{anime}} {{episode}}',
    formats: '支持 B 站 XML / JSON 格式',
    later: '稍后选择',
  },
  /** 从播放记录或影视库继续播放 */
  resume: {
    failedTitle: '无法继续播放',
    readFailed: '读取播放记录失败，请稍后重试',
    expired: '播放记录已失效，请重新导入视频',
  },
  history: {
    title: '播放记录',
    recent: '最近 {{count}} 条',
    total_other: '共 {{count}} 条',
    empty: '还没有播放记录',
    play: '播放',
    delete: '删除记录…',
    revealFailedTitle: '无法定位文件',
    revealFailedDescription: '视频文件可能已被移动或删除',
    /** 桌面端用系统确认框，只有这一处文字，需要把后果一次说清 */
    deleteConfirm:
      '删除「{{title}}」的播放记录？播放进度、本地导入的弹幕、字幕与音轨偏好会一并清除，视频文件不会被删除。',
    deleteFailedTitle: '删除失败',
    deleteFailedDescription: '播放记录未能删除，请稍后重试',
    fallbackTitle: '未知视频',
    completed: '已看完',
    notStarted: '未开始',
  },
  contentChanged: {
    title: '视频内容已变化',
    description: '已作为新视频重新匹配弹幕，旧进度已清除',
  },
  /** 播放中的控制栏：这些大多是按钮的悬停提示与读屏名称 */
  controls: {
    label: '播放控制',
    mobileLabel: '移动端播放控制',
    drag: '拖动播放控制器',
    mute: '静音',
    unmute: '取消静音',
    volume: '音量',
    previous: '上一集',
    next: '下一集',
    back: '后退 5 秒',
    forward: '前进 5 秒',
    play: '播放',
    pause: '暂停',
    noDanmaku: '暂无弹幕',
    hideDanmaku: '关闭弹幕（D）',
    showDanmaku: '开启弹幕（D）',
    settings: '设置',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    progress: '播放进度',
  },
  shell: {
    playing: '正在播放：{{title}}',
    player: '视频播放器',
    video: '视频画面',
    closePlayback: '关闭当前播放',
  },
  /** 播放器右侧的设置面板 */
  settingsPanel: {
    title: '播放器设置',
    close: '关闭播放器设置',
    tabsLabel: '播放器设置分类',
    tabs: {
      playback: '播放',
      danmaku: '弹幕',
      subtitle: '字幕',
      playlist: '播放列表',
    },
    compat: '媒体兼容',
    speed: '播放速度',
    speedNormal: '正常',
    rotation: '画面旋转',
    preferences: '播放偏好',
    autoNext: '自动续播下一集',
    bottomProgress: '控制器隐藏时显示底部进度',
    clickToToggle: '点击画面暂停/播放',
    pip: {
      title: '画中画',
      enter: '进入画中画',
      exit: '退出画中画',
      /** 不能进入画中画的原因，键是 usePictureInPicture 里的原因码 */
      unavailable: {
        unsupported: '当前浏览器不支持画中画',
        compat: '兼容内核暂不支持画中画',
        switching: '播放内核切换中，请稍候',
      },
    },
    controllerPosition: {
      title: '控制器位置',
      top: '上方',
      default: '默认',
      bottom: '下方',
      reset: '重置',
      resetLabel: '重置控制器位置',
    },
    danmakuSources: {
      loading: '正在读取弹幕来源…',
      failed: '弹幕来源读取失败，显示设置仍可使用。',
      empty: '暂无弹幕来源记录。',
    },
  },
  /** 设置面板「媒体兼容」里的媒体信息 */
  mediaInfo: {
    source: '媒体来源',
    remote: '远程 · HTTP/HTTPS',
    local: '本地文件',
    receiveSpeed: '当前接收速度',
    received: '本次累计接收',
    decoder: '视频解码',
    backend: {
      native: '浏览器原生',
      'hevc-wasm': 'HEVC 软件解码',
      unknown: '准备中',
    },
    presenter: '画面呈现',
    transfer: '源传递函数',
    size: '画面尺寸',
    frameRate: '视频帧率',
    frameRateValue: '约 {{fps}} fps',
    decodeFps: '实时解码 FPS',
    noData: '暂无数据',
    colorOutput: '颜色输出',
    browserManaged: '浏览器管理',
    threads: '解码线程',
    workers: '工作线程池',
    workersValue: '{{total}}（含调度线程）',
    memory: 'WASM 线性内存',
    note: '解码说明',
    singleThreadFallback: '多线程运行时不可用，已使用单线程',
  },
  audio: {
    title: '音轨',
    /** 没有名称的音轨 */
    track: '音轨 {{number}}',
    stereo: '当前输出：立体声',
    switchFailed: '音轨切换失败',
  },
  playlist: {
    playing: '正在播放',
  },
  subtitle: {
    remoteNoEmbedded: '远程视频暂不支持内嵌字幕',
    track: '字幕轨道',
    trackPlaceholder: '选择字幕轨道',
    off: '关闭字幕',
    scale: '字幕大小：{{percent}}%',
    scaleLabel: '字幕大小',
    reset: '重置',
    bitmapNoScale: '图片字幕不支持调整大小',
    import: '导入外挂字幕…',
    offset: '时间偏移 {{offset}} 秒',
    offsetLabel: '字幕时间偏移',
    loadingCatalog: '正在读取字幕轨道…',
    loading: '正在读取字幕…',
    cancelLoading: '取消读取',
    /** 字幕出问题时接在原因后面 */
    errorSuffix: '{{error}}，视频将继续无字幕播放。',
    /** 内嵌字幕没有标题时的名称 */
    embedded: '内嵌字幕 {{number}}',
    /** 媒体源服务器没有给字幕名称时的默认名称 */
    numbered: '字幕 {{number}}',
    unsupportedSuffix: {
      bitmap: '（图片字幕，暂不支持）',
      missingIndex: '（图片字幕，文件缺少索引）',
      other: '（暂不支持）',
    },
    savedTooLarge: '字幕已加载；保存内容超过 32 MiB，下次需要重新选择此字幕。',
    failed: {
      load: '字幕加载失败',
      render: '字幕渲染失败',
      reselect: '外挂字幕需要重新选择',
      init: '字幕初始化失败',
      import: '字幕导入失败',
    },
    /** 字幕可以显示，但有些内容被简化处理时的提示 */
    warning: {
      /** 同时有多条提示时的分隔 */
      separator: '；',
      attachmentsTooLarge: '内嵌附件超过 32 MiB，已使用默认字体',
      fontsOverBudget: '内嵌字体超过预算，已使用默认字体',
      fontsPartiallyInvalid: '部分内嵌字体无效，缺失字体使用默认字体',
      fontsReadFailed: '内嵌字体读取失败，已使用默认字体',
      vttRegions: 'WebVTT 区域与 CSS 样式暂不保留',
      positioning: '字幕位置与排版参数暂按默认布局显示',
      vttMarkup: 'WebVTT 扩展标记暂按普通文本显示',
      skippedCues: '已跳过 {{total}} 条时间格式无效的字幕',
    },
  },
  /** 播放中途失败时覆盖在画面上的说明 */
  failure: {
    title: '无法播放此视频',
    details: '查看错误详情',
    changeLink: '更换链接',
    retry: '重试播放',
    retryCompat: '重试兼容播放',
    retryWithCompat: '使用兼容内核重试',
    exit: '退出当前播放',
    feedback: '反馈此问题',
    feedbackPrefill: '播放失败：{{description}}\n',
    feedbackPrefillWithDetail: '播放失败：{{description}}\n错误详情：{{detail}}\n',
    description: {
      provider: '媒体源视频播放失败，请检查服务器连接或重试。',
      remote: '网络视频播放失败，请检查链接或重试。',
      openFailed: '无法打开此视频，请检查文件格式或重新选择视频。',
      unsupportedBrowser:
        '当前浏览器无法播放此视频，且不支持 兼容播放。请换用桌面 Chrome / Edge 或其他格式的视频。',
      network: '媒体读取失败，请检查网络连接后重新打开视频。',
      sourceUnavailable: '视频文件无法访问，请确认文件仍然存在并重新打开。',
      nativeUnsupported:
        '原生播放器无法播放这个文件，当前浏览器暂不支持 兼容播放。请换用桌面 Chrome / Edge，或使用其他格式的视频。',
      audioUnsupported: '当前音轨的编码暂不支持，无法开始播放。请使用包含受支持音轨的视频。',
      decode: '播放器无法读取或解码这个视频，请重试或打开其他视频。',
    },
  },
  /** 播放内核切换时的提示与失败说明 */
  engine: {
    usingCompat: '正在使用兼容内核播放',
    switchedToCompat: '已切换到兼容内核',
    switching: '正在切换兼容内核…',
    compatUnsupported:
      '当前浏览器暂不支持 兼容内核，请使用原生（H5）播放，或换用桌面 Chrome / Edge。',
    failed: {
      start: '内核启动失败',
      switch: '内核切换失败',
      compatStart: '兼容内核启动失败',
      restore: '播放恢复失败',
      read: '媒体读取失败',
    },
  },
} as const
