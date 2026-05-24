## 目的

明确哪些样式表达必须保留 bespoke CSS，以及保留的 CSS 如何组织在仓库中，确保「Tailwind 优先 + CSS 兜底」的规则可被后续 AI / 协作者机械遵守。

### 需求: 必须保留 CSS 的场景被显式列出

CLAUDE.md 中 MUST 增加「样式规范」一节，明确以下场景应保留 bespoke CSS 而非强行 Tailwind 化：

- `@keyframes` 与 `cubic-bezier(...)` 缓动曲线
- `::before / ::after` 伪元素（含 mask / overlay / gradient）
- `:has()` / `:is()` / 多层后代选择器
- `::-webkit-scrollbar-*` 系列
- 包含 `linear-gradient` / `radial-gradient` / `color-mix` 的复合背景
- 同元素多个 `filter` / `backdrop-filter` 叠加

#### 场景: 文档规则可被后续读者执行

- **GIVEN** CLAUDE.md 已包含「样式规范」一节
- **WHEN** 协作者 / AI 准备添加新的样式
- **THEN** 该读者 SHALL 能根据列表直接判断「这条规则该用 Tailwind 还是 .css」
- **AND** 不需要再询问或猜测

### 需求: 保留的 CSS 必须 co-located 在组件目录

保留的 bespoke CSS MUST 拆分到组件同级目录，文件名与组件文件一致（如 `Hero.tsx` 与 `Hero.css` 同目录），并由组件文件直接 `import './Hero.css'`。`styles/library.css` 仅保留跨组件的全局 token / scrim / shell 级规则。

#### 场景: 拆分后的目录结构

- **GIVEN** Hero 组件保留了 `::after` 渐变 + keyframes
- **WHEN** 完成迁移
- **THEN** `src/renderer/src/page/library/Hero.css` SHALL 存在并只包含 Hero 相关规则
- **AND** `Hero.tsx` SHALL 在文件顶部 `import './Hero.css'`
- **AND** `styles/library.css` 中原 Hero 相关规则 SHALL 已被删除

#### 场景: 全局规则保留在 styles 目录

- **GIVEN** `--library-bg` 等真值声明、`.library-shell` 的根容器规则
- **WHEN** 完成迁移
- **THEN** 这些 SHALL 仍留在 `styles/library.css`
- **AND** `styles/library.css` 总行数 SHALL 显著小于迁移前（预期 1154 → 约 300 行以内）

### 需求: 类名前缀冲突防护

保留的 bespoke class 名 MUST 继续使用 `library-* / sidebar-* / app-header-*` 前缀，避免与 Tailwind utility 或 shadcn class 命名冲突。

#### 场景: 新增 bespoke class 命名

- **GIVEN** Hero.css 需要新增一个伪元素叠加层
- **WHEN** 给该层命名
- **THEN** 类名 SHALL 以 `library-hero-` 开头
- **AND** SHALL NOT 与 Tailwind utility class 名冲突
