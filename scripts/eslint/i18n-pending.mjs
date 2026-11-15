/**
 * 界面多语言的豁免名单：这些位置还有写死的中文界面文字，尚未迁移到 packages/i18n。
 *
 * 规则 `marchen/no-hardcoded-ui-text` 对名单之外的 renderer 与 main 源码生效。
 * 名单只能缩短：迁移完一处就从这里删掉对应的一行，全部迁完后删除这个文件。
 * 不要为了让新代码通过检查而往这里加东西——新写的界面文字直接走文案包。
 *
 * 整个目录都没迁移的写成目录，零散的写成具体文件。
 */
export const I18N_PENDING = [
  // ---- renderer：播放器、各页面 ----
  'src/renderer/src/components/modules/player/**',
  'src/renderer/src/components/modules/settings/views/player/**',
  'src/renderer/src/components/modules/app/**',
  'src/renderer/src/components/modules/history/**',
  'src/renderer/src/components/modules/shared/FeedbackDialog.tsx',
  'src/renderer/src/components/modules/shared/VideoDropZone.tsx',
  'src/renderer/src/page/**',

  // ---- renderer：通用组件与外壳 ----
  'src/renderer/src/components/common/ErrorView.tsx',
  'src/renderer/src/components/icons/Logo.tsx',
  'src/renderer/src/components/layout/sidebar/index.tsx',
  'src/renderer/src/components/ui/dialog/Dialog.tsx',
  'src/renderer/src/components/ui/modal/stacked/Modal.tsx',
  'src/renderer/src/components/ui/sheet/Sheet.tsx',
  'src/renderer/src/providers/IpcListener.tsx',
  'src/renderer/src/router/router.tsx',

  // ---- renderer：hooks、工具与请求 ----
  'src/renderer/src/hooks/use-dialog.tsx',
  'src/renderer/src/hooks/use-network-toast.ts',
  'src/renderer/src/hooks/use-update-toast.ts',
  'src/renderer/src/lib/danmaku.ts',
  'src/renderer/src/lib/ns.ts',
  'src/renderer/src/lib/utils.ts',
  'src/renderer/src/request/api-route-client.ts',
  'src/renderer/src/request/ofetch.ts',

  // ---- renderer：服务层（多数是会显示到界面上的错误与状态文案）----
  'src/renderer/src/services/danmaku/**',
  'src/renderer/src/services/history/records.ts',
  'src/renderer/src/services/media/**',
  'src/renderer/src/services/player-loading/**',
  'src/renderer/src/services/player-runtime/**',
  'src/renderer/src/services/translation/**',

  // ---- main：对话框、更新提示与抛给页面的错误 ----
  'src/main/ipc/app.ts',
  'src/main/ipc/danmaku.ts',
  'src/main/ipc/downloads.ts',
  'src/main/ipc/media-sources.ts',
  'src/main/ipc/player.ts',
  'src/main/lib/update-save.ts',
  'src/main/lib/update.ts',
  'src/main/lib/utils.ts',
  'src/main/services/**',
  'src/main/windows/setting.ts',
]
