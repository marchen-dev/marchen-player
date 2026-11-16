/**
 * 弹幕：设置、来源、匹配信息、本地与外链导入、屏蔽、弹幕列表、翻译、悬停工具条。
 *
 * 文案里的 `total`、`skipped` 等数量是调用方已经按界面语言加好千分位的字符串；
 * 不用 `count` 这个名字，因为它在 i18next 里专门表示单复数用的数值。
 */
export default {
  settings: {
    /** 播放侧栏弹幕页的分组标题 */
    groups: {
      display: '显示',
      appearance: '外观',
      sources: '来源与规则',
    },
    show: '显示弹幕',
    traditionalToSimplified: '繁体转简体',
    /** 弹幕翻译开启时这个开关不适用，置灰并显示这句说明 */
    traditionalToSimplifiedDisabled: '翻译开启时不适用',
    fontSize: '字体大小',
    opacity: '不透明度',
    speed: '弹幕速度',
    /** 弹幕速度五档，从慢到快 */
    speedOptions: {
      verySlow: '极慢',
      slow: '较慢',
      normal: '适中',
      fast: '较快',
      veryFast: '极快',
    },
    area: '显示区域',
  },
  source: {
    title: '来源',
    empty: '暂无弹幕',
    unknown: '未知弹幕',
    /** 在线弹幕库的名字 */
    dandanplay: '弹弹play',
    local: '本地弹幕',
    withCount: '{{name}} ({{total}}条)',
    linkBadge: '链接弹幕',
    localBadge: '本地弹幕文件',
    itemCount: '{{total}} 条',
    saveFailed: '保存弹幕来源失败',
    rematch: '重新匹配弹幕库',
    clearCache: '清除弹幕缓存',
    clearCacheConfirm: '是否清除弹幕缓存? 清除后将重新匹配弹幕库',
  },
  matchInfo: {
    title: '匹配信息',
    retryMatch: '重试匹配',
    retryDanmaku: '重试弹幕',
    loading: '正在加载…',
    rematch: '重新匹配',
    match: '匹配动漫',
    status: {
      reloading: '正在加载弹幕…',
      matching: '正在后台匹配动漫…',
      loadingDanmaku: '正在后台加载弹幕…',
      matchFailed: '弹幕匹配失败，视频可正常播放',
      failed: '弹幕加载失败，视频可正常播放',
      unmatched: '未精确匹配，可手动选择剧集',
      matched: '匹配弹幕 {{total}} 条',
      none: '尚未匹配动漫',
    },
  },
  localImport: {
    hint: '从弹幕文件导入，支持 B 站 XML / JSON 格式',
    chooseFile: '选择弹幕文件',
    import: '导入弹幕文件',
    importing: '正在导入…',
    imported: '已导入 {{total}} 条弹幕',
    importedSkipped: '已导入 {{total}} 条弹幕，跳过 {{skipped}} 条无效或不支持的弹幕',
    failed: '导入弹幕失败，请重试',
  },
  /** 从视频页面链接（B 站、优酷等）添加弹幕，仅桌面端 */
  link: {
    title: '从链接添加弹幕',
    urlPlaceholder: '粘贴视频页面链接',
    add: '添加',
    chooseEpisodeLabel: '选择番剧剧集',
    chooseEpisodePlaceholder: '请选择剧集',
    importEpisode: '导入所选剧集弹幕',
    progressLabel: '链接弹幕获取进度',
    offset: {
      title: '链接弹幕偏移',
      sourceLabel: '选择链接弹幕来源',
      hint: '正数延后，负数提前',
      earlier: '提前 0.1 秒',
      later: '延后 0.1 秒',
      inputLabel: '链接弹幕时间偏移（秒）',
      unit: '秒',
      reset: '重置',
      saveFailed: '保存偏移失败',
      invalid: '偏移无效',
    },
    status: {
      selectionCancelled: '已取消选集',
      cancelled: '已取消导入',
      needVideo: '请先打开视频',
      identifying: '正在识别链接…',
      readingInfo: '正在读取视频信息…',
      progress: '{{title}} · {{completed}}/{{segments}} 段 · {{danmaku}} 条',
      chooseEpisode: '请选择要导入弹幕的剧集',
      saving: '正在保存弹幕…',
      added: '已添加 {{total}} 条弹幕',
      addedSkipped: '已添加 {{total}} 条弹幕，跳过 {{skipped}} 条无效或不支持的记录',
      /** 接在「已添加…」后面：B 站只能取到当前弹幕池 */
      currentPoolSuffix: '（当前弹幕池）',
      failed: '导入失败，请重试',
    },
  },
  block: {
    title: '弹幕屏蔽',
    addRule: '添加屏蔽规则',
    /** 入口行的摘要：已有规则数 */
    ruleCount_other: '{{count}} 条规则',
    blockedCount: '本集已屏蔽 {{total}} 条',
    enable: '启用屏蔽',
    modesTitle: '屏蔽类型',
    modes: { scroll: '滚动', top: '顶部', bottom: '底部' },
    inputPlaceholder: '输入关键词，或用 /…/ 写正则',
    inputLabel: '屏蔽规则',
    add: '添加',
    empty: '还没有屏蔽规则。也可以在画面上悬停弹幕直接屏蔽。',
    /** 只在界面语言不是简体中文时显示：弹幕翻译后，用户看到的文字与规则匹配的文字不同 */
    originalTextHint: '规则匹配的是弹幕原文，不是翻译后的文字。',
    listLabel: '屏蔽规则列表',
    removeRule: '移除规则 {{rule}}',
    parse: {
      empty: '请输入要屏蔽的内容',
      invalidRegex: '正则无效：{{detail}}',
      tooLong: '关键词不能超过 {{max}} 个字符',
    },
    /** 弹幕列表里悬停「已屏蔽」时说明命中了什么 */
    hit: {
      scroll: '已屏蔽滚动弹幕',
      top: '已屏蔽顶部弹幕',
      bottom: '已屏蔽底部弹幕',
      regex: '命中正则 {{rule}}',
      keyword: '命中关键词「{{keyword}}」',
    },
    /** 屏蔽弹窗里输入框下方的提示 */
    limitInline: '规则已达上限（{{max}} 条），请先移除不需要的规则',
    limitTitle: '屏蔽规则已达上限（{{max}} 条）',
    limitDescription: '请先在弹幕屏蔽中移除不需要的规则',
    blocked: '已屏蔽「{{text}}」',
    undo: '撤销',
    undoAlt: '撤销屏蔽',
  },
  list: {
    title: '弹幕列表',
    empty: '暂无弹幕',
    totalCount: '共 {{total}} 条',
    filteredCount: '{{shown}} / {{total}} 条',
    searchPlaceholder: '搜索弹幕内容',
    sourceFilterLabel: '按来源筛选',
    allSources: '全部来源',
    columns: { time: '时间', content: '内容', source: '来源' },
    noMatch: '没有匹配的弹幕',
    noEnabled: '当前没有已启用的弹幕',
    /** 顶部、底部弹幕在列表里的角标 */
    modes: { top: '顶', bottom: '底' },
    blocked: '已屏蔽',
    block: '屏蔽',
    blockAria: '屏蔽弹幕：{{text}}',
  },
  /** 画面上悬停弹幕时的工具条 */
  hover: {
    copy: '复制',
    block: '屏蔽',
    original: '原文',
    copied: '已复制弹幕',
    copyFailed: '复制失败，请重试',
  },
  translation: {
    title: '弹幕翻译',
    off: '不翻译',
    status: {
      /** 翻译还没开启，正在后台提前下载翻译资源 */
      preparing: '正在准备翻译资源 {{percent}}%',
      confirming: '等待确认下载',
      downloading: '正在下载翻译资源 {{percent}}%',
      ready: '已开启',
      starting: '正在加载翻译引擎',
      translating: '本集翻译中 {{done}} / {{total}}',
      done: '本集已翻译 {{total}} 条',
      engineFailed: '翻译引擎出错，弹幕按原文显示',
    },
    /** 当前环境不能用弹幕翻译的原因，键是 support.ts 里的原因码 */
    unsupported: {
      not_configured: '当前版本未提供翻译资源',
      no_wasm_simd: '当前浏览器不支持所需的 WebAssembly 特性',
      no_worker: '当前环境不支持后台线程',
      no_decompression: '当前浏览器版本过旧，无法解压翻译资源',
      no_storage: '当前环境无法保存翻译资源',
    },
    confirm: {
      title: '下载翻译资源',
      description:
        '弹幕翻译在本地完成，首次使用需要下载翻译引擎与模型（约 {{size}}）。下载后离线可用，可随时在「通用」设置中清除。',
      confirm: '下载并开启',
    },
  },
} as const
