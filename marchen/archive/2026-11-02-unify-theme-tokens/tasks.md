## 1. 基线截图

- [x] 1.1 `pnpm dev` 启动 Electron，通过 Chrome DevTools MCP 采集变更前的浅色、深色基线截图：首页空状态、设置（通用 / 下载 / 实验室 / 关于）、下载页、媒体源列表与新增表单、影视库、确认对话框、toast、播放中控制栏、播放器设置面板与弹层；保存到 `.tmp/` 作为对比基准（不提交）

## 2. 全局 token

- [x] 2.1 `styles/shadcn.css` 的 `.dark` 按 design D1 色阶重排 `background / popover / card / muted / secondary / input / accent / border / foreground / muted-foreground` 等取值，保持 HSL 三元组格式，并补充中文注释说明层级 L0~L4 与用途
- [x] 2.2 `styles/shadcn.css` 的 `:root` 按 D2 把中性灰换为 zinc 色相，`background / card / popover` 保持白色

## 3. 基础组件凸起语义

- [x] 3.1 Switch：圆点固定白色，轨道保持 `primary / input`（D3）
- [x] 3.2 新增 `field` / `raised` token 并注册到 Tailwind；Tabs 选中项改为 `bg-raised`，导出同源的分段选中样式常量（D3 修订、D4）
- [x] 3.3 Select 触发器、Input、Button outline 改为 `bg-field`，悬停用 `accent`，基础组件不使用 `dark:` 变体（D3 修订）
- [x] 3.4 Dialog、Sheet、Toast、Alert：`bg-background` 改为 `bg-popover text-popover-foreground`（D3）
- [x] 3.5 Divider 与 stacked Modal 的原始色阶类、`shadow-stone-*` 改为语义 token（D9）

## 4. 页面与模块中的硬编码颜色

- [x] 4.1 `page/downloads/index.tsx`、`page/media-sources/SourceBrowser.tsx`、`page/media-sources/SourceFormDialog.tsx` 的手写分段选中态改为引用 3.2 导出的常量，保留 `aria-pressed`（D4）
- [x] 4.2 `page/player/index.tsx` 首页入口按钮改为 `bg-muted hover:bg-accent`（D9）
- [x] 4.3 `components/modules/settings/views/Layout.tsx` 的 `bg-zinc-* / text-zinc-*` 改为语义 token（D5）

## 5. 收编局部色板

- [x] 5.1 `styles/settings.css`：`--settings-*` 改为只定义一次、指向全局 token 的别名层，删除 `.dark [data-app-settings]` 色值块，`--settings-scrim` 保留独立值（D5）
- [x] 5.2 `styles/sidebar.css`：`--sidebar-*` 改为基于 `background / foreground / border` 的别名层，删除 `.dark` 色值块，保留半透明加模糊（D6）
- [x] 5.3 `styles/player.css`：portal / `data-player-theme` 的局部 token 改为从 D1 色阶选档（D7），更新相关注释
- [x] 5.4 `--player-settings-accent` 改为引用 `--brand`；`PlayerControls.tsx` 迷你进度条的 `bg-[#60a5fa]` 改为品牌色（D7）

## 6. 「播放内核」设置行

- [x] 6.1 `PlayerEngineSetting` 拆出状态文案和选项的数据逻辑，提供应用设置用的 `SettingsRow` 布局，播放器面板保持原布局与 `playerMaterial`（D8）
- [x] 6.2 `components/modules/settings/views/general/General.tsx` 改用新布局，去掉外层 `p-4` 包裹
- [x] 6.3 `ApiRouteSetting` 改为标准 `SettingsRow` 排版（D8 修订）

## 6b. 首帧与页面底色

- [x] 6b.1 `index.html` 首帧底色、Electron 窗口 `backgroundColor` 改为与 background token 一致；`html` 底色改为引用 `--background`（实现中发现主区域实际用的是写死的 `#121212`）

## 7. 文档与约定

- [x] 7.1 `AGENTS.md` 的规范要求中新增「颜色」条目，写入 D10 的 5 条约定与例外边界

## 8. 验证

- [x] 8.1 `pnpm typecheck` 与 `pnpm lint` 通过
- [x] 8.2 深色截图验收：对照 1.1 基线逐项检查 spec 场景（开关两种状态、主题切换选中项、下拉框、输入框、对话框层级、设置面板层级、首页按钮、「播放内核」行排版）
- [x] 8.3 浅色截图验收：确认各页面明暗关系与基线一致，只有色相变化
- [x] 8.4 （用 1080p HEVC 正片验证：浅色主题下播放器设置面板、弹幕列表弹窗保持深色；17:15 亮场景与 3:45 暗场景下面板文字均清晰；毛玻璃控件未被基础组件覆盖；强调色等于 `--brand`）播放器验收：浅色主题下播放视频，播放器设置面板、弹层和 toast 保持深色；分别在亮场景和暗场景画面上检查可读性；强调色与应用品牌色一致
- [x] 8.5 衔接检查：侧栏与影视库、侧栏与首页并排时没有突兀跳变；如果明显，按 design 风险项处理
- [x] 8.6 Web 端（`pnpm dev:web`）抽查首页、设置、对话框在两种主题下的表现
- [x] 8.7 取值微调后回写 design.md D1 表中的最终值
