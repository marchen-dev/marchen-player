## 背景

### 当前颜色来源

| # | 色板 | 定义位置 | 现状 |
|---|---|---|---|
| 1 | 全局 shadcn token | `styles/shadcn.css` | 浅色纯灰；深色 `background 0 0% 3.9%`，`muted / input / border / secondary / accent` 全是 `14.9%` |
| 2 | 设置面板 | `styles/settings.css` `--settings-*` | zinc，浅深各一套 rgb 值，与 1 并存 |
| 3 | 侧栏 | `styles/sidebar.css` `--sidebar-*` | 白 / 蓝黑 + 白透明，`.dark` 中重新定义 |
| 4 | 影视库 | `styles/library.css` `--library-*` | 影院式深黑 + 白透明，1192 行 |
| 5 | 播放器弹层 | `styles/player.css` `[data-player-portal-root]` | 局部重写 shadcn token 为 `240 2~3% 11~22%` |
| 6 | 播放器毛玻璃 | `styles/player.css` `--player-*` / `--color-player-*` | 半透明材质，不随主题变化 |

另有硬编码：`Modal.tsx`、`settings/views/Layout.tsx`、`page/player/index.tsx` 中的 neutral / zinc / slate / stone 类共 5 处；`PlayerControls.tsx` 的 `bg-[#60a5fa]` 与 `--player-settings-accent: #0a84ff`。

### 层级倒置的位置

`bg-background` 在基础组件中同时承担"最底层"和"凸起"两种相反的语义：

- 作底色：Sheet、Dialog、Toast、Alert
- 作凸起：Switch 圆点、Tabs 选中项、Select / Input 底、Button outline；`page/downloads/index.tsx`、`page/media-sources/SourceBrowser.tsx`、`SourceFormDialog.tsx` 中手写的分段选中态

### 约束

- token 以 HSL 三元组存储（如 `240 6% 7%`），CSS 中有 `hsl(var(--border) / 60%)` 这类带透明度的写法，Tailwind 通过 `@theme inline` 的 `--color-*: hsl(var(--*))` 接入。新取值必须保持三元组格式。
- 播放器的 portal 节点带 `dark` 类并局部重写 token，确保浮层在浅色主题下也是深色，这一机制保留。
- 「播放内核」组件 `PlayerEngineSetting` 同时用于应用设置和播放器设置面板。

## 目标与非目标

**目标：**

- 全局深色 token 形成可分辨的分层色阶，统一到 zinc 色相；浅色只改色相。
- 基础组件的"凸起 / 选中"不再依赖 `bg-background`。
- 设置面板、侧栏不再维护独立色值；播放器弹层从同一色阶中选档。
- 清除普通界面的原始色阶类和写死的品牌蓝。
- 在 `AGENTS.md` 写入颜色约定。

**非目标：**

- 不迁移影视库 `--library-*`。
- 不合并播放器毛玻璃 `--player-*`（只替换其中的品牌蓝）。
- 不迁移到 oklch，不引入新的颜色工具库，不改主题切换逻辑和品牌色取值。
- 不处理 player/controls 等浮在视频上的 `text-white`、`bg-white/x` 用法（它们属于播放器材质，是合理用法）。

## 决策

### D1：深色色阶（验收后未微调，下表即最终取值）

在现有 shadcn token 名称上重排取值，另外新增两个控件专用 token（`field` / `raised`，见 D3）：

| 层级 | token | HSL | 约等于 | 用途 |
|---|---|---|---|---|
| L0 底色 | `background` | `240 6% 7%` | #111113 | 页面主区、侧栏、设置导航 |
| L1 弹层 | `popover` | `240 6% 10%` | #18181b | Dialog、Sheet、Toast、下拉菜单、设置面板外壳 |
| L2 卡片 | `card` | `240 5% 12.5%` | #1e1e21 | 分组卡片、设置分组 |
| L3 静音 / 输入 | `muted` `secondary` `input` | `240 4% 17%` | #2a2a2d | 开关关闭轨道、分段控件底、入口按钮 |
| L4 选中 / 悬停 | `accent` | `240 4% 21%` | #343438 | 分段选中项、导航选中、悬停 |
| 线 | `border` | `240 4% 19%` | #2f2f33 | 卡片边框、分隔线 |
| 文字 | `foreground` | `240 5% 96%` | #f4f4f5 | |
| 次要文字 | `muted-foreground` | `240 5% 65%` | #a1a1aa | |
| 控件底 | `field` | `240 5% 14.5%` | #242427 | 输入框、下拉框、描边按钮（浅色为白） |
| 选中块 | `raised` | `240 4% 21%` | #343438 | 分段 / Tabs 选中项（浅色为白） |

`primary`、`ring`、`destructive`、`chart-*`、`--brand*` 不变。

**理由**：

- 底色取 #111113，而不是 #0a0a0a 或 #18181b。纯黑往上的亮度空间太窄，正是当前层级挤在一起的原因；#18181b 作底色又会在侧栏、影视库的深黑旁显得发灰。
- 把 `popover` 和 `card` 拆成两档，是为了让设置面板现有的"外壳 < 分组"关系（#18181b < #1f1f23）直接落在全局色阶上，同时保证分组内的输入层（L3）仍比分组亮。
- 取值与设置面板现有深色值几乎重合（导航 #111114、外壳 #18181b、分组 #1f1f23、选中 #34343a），设置面板的视觉变化最小。
- 已知代价：下拉菜单（L1）出现在卡片（L2）之上时会略暗于卡片。它有边框和阴影，可以接受；如果验收觉得别扭，再让 `popover` 与 `card` 同档。

**备选**：改用 shadcn v4 的白色透明 `border` / `input`（`oklch(1 0 0 / 10%)`）。透明边框能适应任何底色，但会和现有的 `hsl(var(--border) / 60%)` 写法叠加透明度，并且要迁移色彩空间，因此不采用。

### D2：浅色只换色相

采用 shadcn 官方 zinc 浅色取值：`foreground 240 10% 3.9%`，`muted / secondary / accent 240 4.8% 95.9%`，`muted-foreground 240 3.8% 46.1%`，`border / input 240 5.9% 90%`；`background / card / popover` 保持 `0 0% 100%`。亮度结构与现状一致。

### D3：基础组件的"凸起"写法

原则：`bg-background` 只用作底色；凸起与控件底色用专用 token 表达，**基础组件不使用 `dark:` 变体**。

> 修订（实现中发现）：最初方案是在基础组件里追加 `dark:bg-input/30` 等 `dark:` 类。但播放器弹层节点固定带 `dark` 类，调用方传入的毛玻璃写法（`bg-white/8`、`hover:bg-white/14`）与带 `dark:` 变体的类不属于同一冲突组，tailwind-merge 不会合并，结果被基础组件的深色类盖掉。改为新增 `field` / `raised` 两个 token：基础组件只写一个 `bg-field` / `bg-raised`，调用方的 bg 类可以正常覆盖。

| 组件 | 写法 |
|---|---|
| Switch 圆点 | 固定 `bg-white`（两种主题都需要白色圆点，无需 token） |
| Switch 轨道 | `checked:bg-primary`，`unchecked:bg-input`（L3 在 L2 卡片上可分辨） |
| Tabs 选中项 / 分段选中 | `bg-raised shadow-sm`（浅色白，深色 L4） |
| Select / Input / Button outline | `bg-field border-input`；Button outline 悬停 `bg-accent` |
| Dialog / Sheet / Toast / Alert | `bg-popover text-popover-foreground`（浅色同为白色） |

播放器弹层的局部色板同时给出 `field`（L3）与 `raised`（略高于 L4），未自定义材质的控件在播放器里也能保持层级。

### D4：分段选中态抽成一处

下载页、媒体源页（2 处）手写的 `bg-background text-foreground hover:bg-background shadow-sm` 选中态，抽成一个与 Tabs 选中项同源的样式常量（放在 `components/ui/tabs` 中导出），三处统一引用。保留按钮的 `aria-pressed` 语义，不强行改成 Tabs，因为它们是筛选按钮而不是 tabpanel。

### D5：设置面板改为别名层

`settings.css` 中的 `--settings-*` 保留名称（CSS 内约 19 处引用，避免大范围改选择器），全部改为指向全局 token，删除所有具体色值。导航底、选中、悬停在浅色和深色下需要指向不同层级（浅色导航为 muted，选中借用 border 的 zinc-200；深色导航为 background，选中为 accent），因此 `.dark [data-app-settings]` 中保留少量**只引用 token** 的覆盖：

```
--settings-navigation → background (L0)      --settings-shell    → popover (L1)
--settings-group      → card (L2)            --settings-border   → border
--settings-selected   → accent (L4)          --settings-hover    → accent / 60%
--settings-text       → foreground           --settings-muted    → muted-foreground
--settings-scrim      → 保留独立值（遮罩是黑色透明，不属于表面层级）
```

浅色下，外壳从 #fafafb 变为白色，导航从 #f4f4f6 变为 muted 95.9%，分组仍为白色并依靠边框区分，变化很小。`settings/views/Layout.tsx` 中的 `bg-zinc-50 dark:bg-zinc-900 text-zinc-500` 改为 `bg-card text-muted-foreground`。

别名层被允许的前提是：它只能指向全局 token，不能写具体色值。这一点写入约定。

### D6：侧栏改为别名层

`sidebar.css` 同样保留 `--sidebar-*` 名称，删除 `.dark` 中的色值：

- `sidebar-bg` → `hsl(var(--background) / 92%)`（保留原有半透明加 `backdrop-filter`）
- `sidebar-fg` / `fg-2` / `fg-3` → `foreground` 的 100% / 70% / 45%
- `sidebar-panel-1` / `panel-2` → `foreground` 的 4% / 10%（浅色下 foreground 为深色，自然得到原来的深色透明叠层）
- `sidebar-line` → `border`

浅色下 `foreground` 为 `240 10% 3.9%`，与原来的 `rgba(10,12,16,x)` 基本一致。

### D7：播放器弹层从同一色阶选档

`[data-player-portal-root], [data-player-theme]` 继续局部重写 token，但取值只从 D1 的色阶中选择，不再自定义中间值。由于浮层压在视频上，需要整体亮一档：

```
background → L1 (240 6% 10%)    popover / card → L2 (240 5% 12.5%)
muted      → L3                 secondary / accent / border / input → L4
```

`destructive` 的文字可读性修正（`0 72% 60%`）保留。`--player-settings-accent` 改为 `var(--brand)`；迷你进度条的 `bg-[#60a5fa]` 改为品牌色（视频上的细线需要提亮时使用 `--brand-text` 的深色档位）。`--player-focus` / `--player-settings-focus` 属于焦点环，不在本次"品牌色单一来源"范围内，保持不变。

### D8：「播放内核」与「API 线路」行

`PlayerEngineSetting` 增加一个布局参数（或拆出数据 hook + 两种外观），在应用设置中用 `SettingsRow` 渲染：标题「播放内核」，说明为当前状态文案（当前内核、切换中、不支持原因、错误），右侧为下拉框。播放器设置面板继续使用现有布局与毛玻璃材质。数据逻辑只保留一份。

「API 线路」（`ApiRouteSetting`，只用于应用设置）同样存在排版问题，直接改为渲染 `SettingsRow`，「当前线路」作为说明文字。

### D9：首页入口按钮与 Modal

- `page/player/index.tsx` 入口按钮：`bg-neutral-200/60 … dark:bg-neutral-800 dark:hover:bg-neutral-700` 改为 `bg-muted hover:bg-accent`。
- `components/ui/modal/stacked/Modal.tsx`：`bg-zinc-50/90 dark:bg-neutral-900/90` 改为 `bg-popover/90`；`border-slate-200 dark:border-neutral-800` 改为 `border-border`；`shadow-stone-*` 改为中性的 `shadow-black/x`。
- `Divider` 的 `bg-black dark:bg-white` 加不透明度写法，改为 `bg-border`。

### D9b：页面底色与首帧颜色（实现中补充）

实现中发现首页主区域的底色并非来自 token，而是 `index.html` 内联样式写死的 `#121212` / `#fafafa`（`body` 本身没有底色），Electron 窗口 `backgroundColor` 也写死了同样的值。处理方式：`html` 底色改为 `hsl(var(--background))`；首帧内联样式与窗口底色保留字面量（样式表加载前无法读取变量），但取值同步为 `#111113` / `#ffffff`，并加注释说明需与 token 保持一致。浅色主区域因此从 #fafafa 变为白色，与下载页、媒体源页原本的 `bg-background` 一致。

### D10：约定写入 AGENTS.md

在「代码风格 / 规范要求」中增加一条「颜色」：

1. 普通界面只用语义 token（`bg-background/card/popover/muted/accent`、`text-foreground/muted-foreground`、`border-border` 等），不用 `zinc-*`、`neutral-*`、`slate-*`、`stone-*`、`gray-*` 原始色阶，不写任意色值。
2. `bg-background` 只表示最底层；凸起、选中、悬停用更高一档的 token。
3. 模块需要特殊氛围时，只在作用域内重写 token 的值；模块内的别名变量只能指向全局 token。
4. 例外：浮在视频上的播放器界面使用 `--player-*` 材质；影视库使用 `--library-*`（历史例外，新模块不得效仿）。
5. 品牌蓝只用 `--brand` / `--brand-text` / `--brand-press`。

## 风险与权衡

- **全局取值波及面大**：约 43 个 tsx 文件会受深色取值变化影响，其中 `muted`（114 次）、`accent`（37 次）、`popover`（16 次）用得最多。缓解：按页面清单逐一截图验收（首页、播放中、播放器设置与弹层、toast、影视库、媒体源列表与表单、下载、设置 4 页、确认对话框），浅色、深色各一轮，Electron 为主、Web 抽查。
- **`popover` 与 `card` 拆档**：下拉菜单出现在卡片上时会略暗于卡片。如果验收认为别扭，让两者同档，同时把设置面板外壳改为 `background`、导航改为别名到 `background` 并依靠边框分隔。
- **侧栏与影视库的衔接**：侧栏从近黑（约 4%）抬到 7%，旁边是影视库的 #050608（约 2.5%），可能产生轻微的明暗差。可以接受；如果明显，侧栏在影视库路由下可以继续使用 `--library-bg`（侧栏已经是半透明加模糊）。
- **播放器弹层变化**：D7 的选档会让播放器内的 Dialog 从 11% 变为 10%，下拉从 14% 变为 12.5%，需要在亮场景和暗场景视频上各看一次。
- **浅色设置面板细微变化**：外壳从 #fafafb 变为白色。如果不能接受，外壳在浅色下可以改为 `muted / 40%` 一类的混合，但仍只引用全局 token。
- **未覆盖的颜色**：影视库与播放器毛玻璃中仍有大量具体色值。这是有意保留，并已在约定中写明边界，防止新代码效仿。
