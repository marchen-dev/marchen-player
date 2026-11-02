## 动机

夜间模式下，设置面板、首页和通用控件的观感很差：开关关闭态几乎看不见，打开后是蓝轨道配黑圆点；主题切换的选中项是一块比底色还深的黑块；下拉框是厚重的黑底；冷灰与纯灰混在同一画面中显得杂乱。

根因有两层：

1. **全局 shadcn 深色 token 层级倒置**。`--background` 为 `0 0% 3.9%`（近纯黑），而 Switch 圆点、Tabs 选中项、Select / Input / Button outline 以及若干手写分段选中态都用 `bg-background` 表达"凸起"。浅色下 background 是白色，恰好成立；深色下它是全场最暗的颜色，凸起的元素全部陷了下去。`--input` / `--muted` / `--border` 又都是同一个 `14.9%`，层与层之间几乎没有亮度差。
2. **色板碎片化**。因为全局 token 不好用，各模块绕开它另建色板：目前共有 6 套（全局 shadcn、设置 `--settings-*`、侧栏 `--sidebar-*`、影视库 `--library-*`、播放器弹层局部重写 token、播放器毛玻璃 `--player-*`），外加 5 处原始色阶类（neutral / zinc / slate / stone）和 2 处写死的蓝色。全局用纯灰（hue 0），其余多为 zinc 冷灰，同屏出现时冷暖不一。`styles/player.css` 的注释已经记录过同一个问题，当时选择了局部绕开。

不修全局，下一个新模块还会再造一套色板，调整深色外观需要同时改 4 个文件且难以保持一致。

## 变更内容

- **重排全局 token**：深色改为 zinc 色相的分层色阶（底色约 `#111113`，卡片 `#18181b`，输入 / 静音层 `#27272a`，选中 `#323236`），相邻层级之间有可分辨的亮度差；浅色只把色相改为 zinc，不调整亮度结构。
- **统一"底色 / 凸起"语义**：`bg-background` 只表示最底层。Switch、Tabs、Select、Input、Button outline、Dialog / Sheet 等基础组件对齐 shadcn 新版的深色写法；下载页、媒体源页手写的分段选中态改为复用统一样式。
- **收编局部色板**：设置面板 `--settings-*` 与侧栏 `--sidebar-*` 改为引用全局 token；播放器弹层的局部重写基于同一色阶取值。
- **清理硬编码颜色**：Modal、设置 Layout、首页入口按钮中的原始色阶类改为语义 token；播放器中写死的 `#0a84ff`、`#60a5fa` 改为引用品牌色。
- **修正「播放内核」设置行**：在应用设置中与其他设置行使用同一排版（标题、说明、控件位置一致），播放器设置面板内的表现不变。
- **写入颜色约定**：在 `AGENTS.md` 中补充颜色使用规则和三套色板的适用边界。

明确不做：

- 影视库 `--library-*` 保持现状，记为有意保留的氛围例外。
- 播放器毛玻璃 `--player-*` 保留为独立材质（浮在视频上、不随主题变化），只把其中的品牌蓝收回到 `--brand`。
- 不新增主题、不调整品牌色取值、不改变主题切换逻辑。

## 能力

### 新增能力

- `theme-color-system`：全局颜色 token 的色阶、色相、作用域边界，以及模块使用颜色的约定。
- `ui-surface-semantics`：基础组件在浅色和深色下"底色 / 卡片 / 凸起 / 选中"的层级表现。
- `settings-panel-appearance`：应用设置面板复用全局 token，且所有设置行排版一致。

### 修改能力

无。

## 影响范围

- 样式：`src/renderer/src/styles/shadcn.css`、`settings.css`、`sidebar.css`、`player.css`
- 基础组件：`components/ui/` 下的 switch、tabs、select、input、button、dialog、sheet、toast、alert、divider、modal
- 页面与模块：`page/downloads/index.tsx`、`page/media-sources/`（SourceBrowser、SourceFormDialog）、`page/player/index.tsx`、`components/modules/settings/`（Layout、general）、`components/modules/shared/setting/PlayerEngineSetting.tsx`、`components/modules/player/controls/PlayerControls.tsx`、`components/modules/player/setting/`
- 文档：`AGENTS.md`
- 间接影响：所有使用全局 token 的界面（约 43 个 tsx 文件）在深色下的取值都会变化，需要 Electron 与 Web 两端的浅色、深色截图验收。
- 不涉及 IPC、数据库、播放内核、遥测。
