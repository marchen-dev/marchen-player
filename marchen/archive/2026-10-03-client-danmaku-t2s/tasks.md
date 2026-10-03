## 背景

现有「繁体转简体」依赖弹弹play 服务端 `chConvert` 参数，但开关在播放器侧栏中永远不渲染（`DanmakuSetting` 的 `!isPlaying` 分支），功能实际不可用；且服务端方案只覆盖弹弹play 来源、命中缓存后切换不生效。

改为客户端转换：缓存与 HISTORY 始终保存原文，在 `services/player-runtime/danmaku/context.tsx` 把合并后的弹幕送入渲染器前，按开关用 OpenCC 字典（仅 TSCharacters + TSPhrases，约 37 KB，直接打包）做繁 → 简字形转换，覆盖弹弹play、本地文件、B 站链接全部来源，Web 与 Electron 共用。设置沿用 `enableTraditionalToSimplified`（默认 false），开关放在播放器侧栏弹幕分组，播放中可即时切换。不做简 → 繁、不做地区用语转换。服务端 `chConvert` 链路与只承载它的 `SettingsReader` Port 一并删除。

## 1. 转换函数

- [x] 1.1 添加依赖 `opencc-js@1.4.2`（锁定版本），确认 `core` 与 TS 字典子路径导入的类型可用
- [x] 1.2 新增 `services/player-runtime/danmaku/traditional-to-simplified.ts`：懒建转换器，按文本缓存结果，提供 `toSimplified(text)` 与对弹幕条目数组的转换
- [x] 1.3 新增单元测试：頭髮 → 头发、乾淨 → 干净、後來 → 后来、简体与非中文文本保持不变

## 2. 接入运行时与 UI

- [x] 2.1 `danmaku/context.tsx` 读取 `enableTraditionalToSimplified`，在 `items` 生成时按开关转换
- [x] 2.2 `DanmakuSetting.tsx`：删除永远不可达的 `!isPlaying` 分支与 `onTraditionalToSimplifiedChange` prop，在侧栏弹幕分组显示「繁体转简体」开关，切换时 `captureFeatureUsed` 上报

## 3. 删除服务端 chConvert 链路

- [x] 3.1 `player-loading`：移除 `SettingsReader` 类型、导出、`ServiceDeps.settings`、`DanmakuAPI.getDanmu` 的 `chConvert` 选项及 load / rematch 中的读取，同步测试 mock
- [x] 3.2 renderer：移除 `services/player-loading/index.ts` 的 `settings` 注入、`dandanplay-api.ts` 与 `request/api/comment.ts` 的 `chConvert` 参数，同步测试
- [x] 3.3 CLAUDE.md 的 Port 列表移除 `SettingsReader`

## 4. 验证

- [x] 4.1 `pnpm typecheck`、`pnpm lint`、`pnpm test:player-runtime` 与 player-loading 包测试通过
- [x] 4.2 `pnpm build:web` 与 `pnpm build` 通过，确认产物只包含 TS 两张字典而非 OpenCC 全量字典
