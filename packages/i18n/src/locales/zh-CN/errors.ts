/**
 * 失败提示。
 *
 * - `generic`：各类操作的概括说明。错误没有专门的文案时（解析器、解码器等内部细节），
 *   英文界面只显示这里的一句话；简体中文界面显示错误原来的中文说明。
 * - 其余各组：键就是错误码（`域.原因`），与代码里 `UserError` 的 code 一一对应。
 *   已有的错误码沿用原来的写法（snake_case），它们同时是遥测的聚合维度，不要改名。
 */
export default {
  generic: {
    unknown: '操作失败',
    openVideo: '无法打开视频',
    /** 概括说明后面附上原始细节（细节不含汉字时才附） */
    withDetail: '{{summary}}：{{detail}}',
  },
  /** 弹幕翻译的资源下载，错误码见 services/translation/assets/download.ts */
  translation: {
    assets_network: '下载失败，请检查网络',
    assets_http: '下载失败，资源暂时不可用',
    assets_integrity: '下载的文件校验未通过',
    assets_storage: '保存失败，可能是磁盘空间不足',
    assets_aborted: '下载已取消',
  },
  /** 从视频页面链接添加弹幕。主进程里各平台的具体失败合并到这几个错误码 */
  danmakuLink: {
    duplicate: '已经添加过该来源',
    invalid_url: '请输入有效的视频页面链接',
    unsupported_url: '暂不支持此视频链接',
    network: '网络请求失败，请稍后重试',
    http: '弹幕接口返回 HTTP {{status}}，请稍后重试',
    unavailable: '无法读取视频信息，视频可能不可用或请求受限',
    danmaku_closed: '该视频弹幕已关闭',
    empty: '该链接没有可导入的弹幕',
    not_found: '没有找到指定的分集',
    too_large: '弹幕数量或大小超过读取限制',
    busy: '已有弹幕导入任务，请稍后重试',
    cancelled: '导入已取消或超时',
  },
  /** 下载。任务的失败原因以编码后的文字保存，显示时按这里取文案 */
  downloads: {
    invalid_link: '请输入 HTTP/HTTPS 文件直链或 BT v1 磁力链接',
    exists: '该下载任务已存在',
    limit: '下载任务超过限制',
    invalid_torrent: '种子文件无效或不受支持',
    unsupported_torrent: '目前只支持 BT v1，不支持 v2 或混合种子',
    name_conflict: '保存目录中已存在「{{name}}」，请选择其他保存目录',
    no_files_selected: '请先选择要下载的文件',
    file_missing: '已下载文件被移动或修改',
    not_finished: '文件尚未下载完成',
    in_use: '文件正在使用中，请先结束播放',
    engine: '下载引擎出错，请重试',
    transfer_failed: '下载失败，请检查目录、空间或网络后重试',
    timeout: '连接超时，请重试',
    cancelled: '已取消',
    expired: '待确认任务已过期，请重新添加',
    http_start: 'HTTP 下载启动失败，请检查链接和保存目录后重试',
    interrupted_resumable: '下载中断，可点击重试继续',
    interrupted_restart: '下载中断，重试将从头下载',
    incomplete: '下载未完成，重试将尝试续传',
    save_failed: '下载完成但文件保存失败，请检查目标目录',
    persist_failed: '下载记录保存失败，已停止传输，请检查磁盘后重启应用',
    storage_corrupt: '下载记录损坏或版本不兼容，已保留原文件，请恢复备份',
    desktop_only: '下载功能仅在桌面端可用',
  },
  /** 打开网络视频，错误码见 packages/shared/src/media/remote.ts 的 RemoteMediaError */
  remoteMedia: {
    access: '视频链接无法访问，请检查地址或更换链接',
    range: '该来源不支持按需读取，请使用其他视频直链',
    changed: '视频内容已变化，请重新打开',
    unsupported: '请输入不含账号密码的 HTTP/HTTPS 视频文件直链，暂不支持播放清单',
  },
  /** 从本地文件导入弹幕 */
  localDanmaku: {
    duplicate: '已经添加过该来源',
    invalid_format: '弹幕格式不正确，请选择 B 站格式的 XML 或 JSON 文件',
    empty: '文件中没有可导入的弹幕',
    read_failed: '读取弹幕文件失败，请重试',
    save_failed: '保存弹幕失败，请检查存储空间后重试',
  },
  /** 打开本地视频时主进程给出的失败 */
  videoImport: {
    file_moved: '视频文件可能被移动，无法继续播放',
    info_failed: '获取视频信息失败',
  },
  /** 安装更新前保存播放进度 */
  update: {
    save_timeout: '保存播放进度超时，请重试',
    save_request_failed: '保存请求失败',
    save_failed: '保存播放进度失败，请重试',
  },
  /** 外挂字幕导入，错误码见主进程 ipc/player.ts 与 SubtitleError */
  subtitle: {
    not_downloaded: '字幕尚未下载完成',
    unsupported_format: '字幕文件格式不受支持',
    too_large: '字幕文件过大',
  },
  /** 播放内核报告的失败，错误码见 packages/playback-core 的 PlaybackError */
  playback: {
    aborted: '媒体加载已取消',
    network: '读取媒体时网络连接失败',
    decode: '当前环境无法解码该媒体',
    'not-supported': '当前环境不支持该媒体格式或编码',
  },
  /** 图片字幕（PGS），错误码见 services/media/subtitles/pgs */
  pgs: {
    backtrack_exceeded: '字幕依赖链过长，当前位置暂不显示',
  },
  /** 媒体源（WebDAV / Jellyfin / Emby），错误码见 packages/shared/src/media-sources */
  mediaSource: {
    auth_failed: '账号或密码错误，或登录已失效',
    forbidden: '当前账号没有访问权限',
    unreachable: '无法连接服务器，请检查地址和网络',
    certificate: '服务器证书不受信任，暂不支持自签名证书',
    unsupported_version: '服务器版本过低，请升级后再试',
    range_unsupported: '该来源不支持按需读取，无法播放',
    not_found: '内容不存在或已被移动',
    content_changed: '视频内容已变化',
    source_removed: '媒体源已被移除',
    invalid_input: '填写的信息无效',
    invalid_response: '服务器返回了无法识别的内容',
  },
} as const
