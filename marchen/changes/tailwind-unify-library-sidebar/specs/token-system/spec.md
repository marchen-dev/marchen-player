## 目的

把私域 CSS 变量（`--library-*` / `--sidebar-*` / `--app-header-*`）桥接到 Tailwind 的 `@theme` 词典，使其可作为 utility class 在 JSX 中直接使用，同时保留主题切换（dark mode）所需的真值覆盖层。

### 需求: Tailwind 必须能识别 library / sidebar / app-header 命名空间下的 token

桥接完成后，项目内任意 JSX MUST 能通过 Tailwind utility 直接引用桥接过的 token。`@theme` 仅做映射登记，token 真值 MUST 留在 `:root / .dark` 内，确保主题切换链路不被破坏。

#### 场景: 颜色 token 注册并通过 utility 使用

- **GIVEN** `tailwind.css` 的 `@theme {}` 块声明 `--color-library-bg-2: var(--library-bg-2)`
- **AND** `:root` 与 `.dark` 仍各自声明 `--library-bg-2` 真值
- **WHEN** JSX 写 `className="bg-library-bg-2"`
- **THEN** 编译后的 CSS SHALL 将该元素背景设为当前主题对应的 `--library-bg-2` 值
- **AND** 切换 `.dark` class 时背景 SHALL 立即更新为暗色真值

#### 场景: 阴影 / 半径 / 尺寸 token 同样被识别

- **GIVEN** `@theme` 内同时注册 `--shadow-library-card`、`--radius-library-card`、`--spacing-rail-card-w`
- **WHEN** JSX 写 `className="shadow-library-card rounded-library-card w-rail-card-w"`
- **THEN** Tailwind SHALL 编译生成对应 utility class
- **AND** 视觉结果 SHALL 与原 `.library-poster-card` 规则一致

### 需求: 不适合登记的 token 必须保留 CSS var 形式

非简单原子（渐变 / `color-mix` / 复合滤镜 / 多层叠加背景）不应强行 utility 化。这类 token MUST 保留为 CSS var，在需要使用时 JSX 通过 `className="[background:var(--library-poster-shade)]"` 或在 bespoke `.css` 中使用。

#### 场景: 渐变 token 不被错误注册

- **GIVEN** 一个值为 `linear-gradient(180deg, transparent, rgba(0,0,0,0.85))` 的变量 `--library-poster-shade`
- **WHEN** 设计 token 注册表
- **THEN** `--color-library-poster-shade` SHALL NOT 出现在 `@theme` 中（因为不是单一颜色）
- **AND** 该变量仍 SHALL 保留在 `:root / .dark` 中供 CSS 或 arbitrary value 使用

### 需求: 主题切换链路不变

桥接前后，dark mode 切换的行为 MUST 完全一致：切换 `.dark` class 即触发所有桥接 token 的视觉更新。

#### 场景: dark mode 切换不破坏 utility 显示

- **GIVEN** 用户当前在亮色模式，页面渲染使用 `bg-library-bg-2`
- **WHEN** 切换到暗色模式（`.dark` class 应用）
- **THEN** 该元素的背景 SHALL 立即更新为 `:root.dark` 下声明的 `--library-bg-2` 真值
- **AND** 无需重新构建或刷新页面
