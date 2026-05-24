## 目的

按组件复杂度分级，将 library / sidebar / app-header 模块的样式表达从 bespoke `.css` 类名迁移到 Tailwind utility class，保持视觉与行为完全一致。

### 需求: 组件按 Tier 1 / Tier 2 / Tier 3 分级处理

每个目标组件 MUST 被归入 Tier 1（纯 Tailwind）/ Tier 2（hybrid）/ Tier 3（结构保留 bespoke）之一。分级依据是结构复杂度与是否含有伪元素 / keyframes / 复合状态选择器。

#### 场景: Tier 1 组件全部 className 由 Tailwind utility 表达

- **GIVEN** 组件 PosterCard / LandscapeCard / Rail / PosterGrid / EmptyState / Sidebar / AppHeader 被归类为 Tier 1
- **WHEN** 完成迁移
- **THEN** 这些组件的 JSX SHALL NOT 引用任何 `library-* / sidebar-* / app-header-*` 前缀的非 utility class
- **AND** 对应的 `.css` 文件中相关规则 SHALL 被删除

#### 场景: Tier 2 组件保留必要 bespoke CSS

- **GIVEN** 组件 Hero / EpisodeGrid / LibraryShell 含有 `::after` 渐变层、`:has()` 选择器或 keyframes 引用
- **WHEN** 完成迁移
- **THEN** 这些组件的简单属性（间距 / 字号 / 颜色 / flex）SHALL 改写为 Tailwind utility
- **AND** 不可表达的复合规则（伪元素、`:has`、scrollbar 样式）MAY 保留为 bespoke CSS
- **AND** 保留的 CSS SHALL 拆分到组件同级目录（如 `Hero.css` 与 `Hero.tsx` 同级）

#### 场景: Tier 3 仅做轻迁移

- **GIVEN** DetailOverlay 含有 keyframes、scrollbar、复杂 z-index 叠层与近期修复的滚动结构
- **WHEN** 完成迁移
- **THEN** 仅文本 / 间距 / 颜色相关 className SHALL 改写为 Tailwind utility
- **AND** banner / scroll / poster 主结构与 keyframes SHALL 保留 bespoke CSS 不动

### 需求: 状态选择器迁移用 data-* 属性表达

组件中的状态复合选择器（如 `.library-ep-tile.watched`）迁移后 MUST 改用 `data-*` 属性 + Tailwind `data-[xxx]:` variant 表达，避免 JSX 内堆叠条件 className 字符串。

#### 场景: 已观看状态用 data-watched

- **GIVEN** EpisodeGrid 的 ep-tile 当前根据 `watched` 布尔切换 `.watched` class
- **WHEN** 完成迁移
- **THEN** JSX SHALL 输出 `data-watched={watched ? '' : undefined}`
- **AND** className 中 SHALL 用 `data-[watched]:text-library-fg-3` 形式表达 watched 态样式

### 需求: 视觉与行为完全一致

迁移前后，所有 Tier 1 / Tier 2 / Tier 3 组件的视觉表现与交互行为 MUST 完全一致，亮色与暗色模式下均无可察觉差异。

#### 场景: 亮色 / 暗色双模式视觉一致

- **GIVEN** 任意已迁移的组件
- **WHEN** 在亮色模式下截图比对，并在暗色模式下截图比对
- **THEN** 颜色 / 间距 / 字号 / 阴影 / 圆角 SHALL 与迁移前一致
- **AND** hover / focus / 选中状态 SHALL 与迁移前一致

### 需求: 长 className 通过 cn() 拆分

当单个元素的 utility 字符串超过约 80 字符或包含明显分组逻辑时，MUST 用 `cn()`（项目已有的工具函数）拆分为多行或多个语义片段，确保可读性。

#### 场景: 复杂卡片样式分组

- **GIVEN** PosterCard 根元素需要表达：基础形状 + 卡片背景 + hover 反馈 + 过渡动画
- **WHEN** 迁移这部分 className
- **THEN** JSX SHALL 用 `cn('base utilities', 'hover utilities', 'transition utilities')` 形式分组
- **AND** 单行 className 字符串 SHALL NOT 超过约 80 字符
