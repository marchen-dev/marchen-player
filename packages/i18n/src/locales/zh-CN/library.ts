/** 影视库（仅桌面端） */
export default {
  detail: {
    close: '关闭详情',
    episodesTitle: '剧集',
    /** 已看到第几话 / 共几话，两个数字都补成两位 */
    progress: '第 {{watched}} / {{total}} 话',
  },
  /** 作品的总话数 */
  episodeCount_other: '{{count}} 话',
  empty: {
    title: '影视库为空',
    sub: '播放动画后会自动入库',
    noMatchTitle: '没有匹配项',
    noMatchSub: '试试清除筛选或搜索条件',
  },
  /** 剧集格子的读屏说明 */
  episode: {
    watched: '已看完',
    watchedPercent: '已观看 {{percent}}%',
    notStarted: '未开始',
  },
  hero: {
    onAir: 'On Air · 连载中',
    continueWatching: 'Continue Watching · 继续观看',
    details: '详情',
    lastWatched: '上次到 第 {{episode}} 话',
  },
  card: {
    resume: '续看 · 第 {{episode}} 话',
    episode: '第 {{episode}} 话',
    play: '播放',
    upcoming: '即将开始',
    onAir: '连载中',
    completed: '已看完',
  },
  menu: {
    play: '播放',
    playEpisode: '播放 · 第 {{episode}} 话',
    details: '查看详情',
    resetProgress: '重置观看进度',
    markAllWatched: '标记全部已看',
    remove: '从影视库移除…',
  },
  rail: {
    continueWatching: '继续观看',
    all: '所有作品',
    scrollLeft: '向左滚动',
    scrollRight: '向右滚动',
  },
  /** 作品的文件来源 */
  source: {
    local: '本地',
    remote: '远程',
    mixed: '本地 + 远程',
  },
  /** 主按钮上的文字 */
  cta: {
    start: '开始观看',
    continue: '继续观看',
    continueEpisode: '继续观看 · 第{{episode}}话',
  },
  removeConfirm: '从影视库移除「{{title}}」？播放记录会保留，再次播放时会重新加入。',
} as const
