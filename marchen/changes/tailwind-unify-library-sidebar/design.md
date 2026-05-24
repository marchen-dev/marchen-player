## 背景

项目主体样式表达走 Tailwind 4（`@theme` + utility class + shadcn），但 library / sidebar / app-header 是 bespoke `.css` 写成的（合计约 1330 行）。两套范式割裂带来认知成本和 token 系统不连贯。

Tailwind 4 的 `@theme` 块支持把 CSS 变量直接登记为 utility 源——这给「桥接现有 var → Tailwind 词典」提供了天然机制，不需要重写真值层。

## 目标与非目标

**目标：**

- 让 `bg-library-bg-2 / text-library-fg-3 / shadow-library-card` 等 Tailwind utility 可直接使用
- 把 `library.css` 1154 行压缩到约 300 行以内
- 把保留的 bespoke CSS 拆分到组件同级目录，避免单文件膨胀
- 视觉与行为零回归（亮 / 暗双模式均逐组件验证）
- 在 CLAUDE.md 明文写下「Tailwind 优先 / CSS 兜底」规则，让后续不需要再决策

**非目标：**

- 不重写 token 真值（`:root / .dark` 块不动）
- 不改主题切换机制
- 不迁 shadcn / player / settings / 其它已经是 Tailwind 的组件
- 不重新设计视觉
- 不引入 `cva` 等额外抽象（除非个别组件 className 真的复杂到必须）

## 决策

### 1. Token 桥接走 `@theme` 内的 `var()` 引用，而非复制真值

```
@theme {
  --color-library-bg-2: var(--library-bg-2);
}

:root { --library-bg-2: #ffffff; }
.dark { --library-bg-2: #0c0e12; }
```

不选择「把真值直接写进 @theme」，因为：

- 真值放 `:root / .dark` 才能让 dark mode 切换通过 cascade 触发
- `@theme` 在 Tailwind 4 中是「注册词典」的语义层；混入真值会让职责不清
- 这种双层指向（`@theme` 引用 var，var 在 :root/dark 真值切换）已被 shadcn 默认模式验证可用

### 2. 不全部桥接，渐变 / color-mix / 复杂滤镜保留 CSS var

判定准则：**Tailwind utility 是否表达得比 CSS 短/清晰**。

| token 类型 | 处理 | 例子 |
|---|---|---|
| 单色 | `@theme --color-library-*` | `--library-bg-2` |
| 阴影 | `@theme --shadow-library-*` | `--library-shadow-card` |
| 半径 | `@theme --radius-library-*` | `--library-radius-card` |
| 尺寸 | `@theme --spacing-*` | `--library-rail-card-w` |
| 渐变 | **保留 CSS var**，需要时用 arbitrary value | `--library-poster-shade` |
| color-mix | **保留 CSS var** | `oklch(0.66 0.22 22 / 0.5)` 可登记，但 `color-mix(in oklch, ...)` 保留 |
| 多层背景 | **保留 CSS var** | Hero `::after` 的多层渐变 |

### 3. 状态切换从 className 改为 data-* 属性

`.library-ep-tile.watched` 改写为 `data-watched` 后用 `data-[watched]:` variant 表达。理由：

- 避免 JSX 内堆条件 className 字符串（`cn('base', watched && 'watched')` → `data-watched={watched ? '' : undefined}`）
- Tailwind 4 对 `data-[]` variant 支持完整
- 语义上 data 属性表达状态比 class 拼接更清晰
- 与 shadcn 已有模式（`data-[state=open]:`）一致

### 4. 分级迁移，DetailOverlay 仅做轻迁移

- Tier 1（7 个组件，全部 utility）：直接迁
- Tier 2（3 个组件，hybrid）：简单部分 utility，伪元素/`:has()`/keyframes 保留为 `Hero.css` 等同级文件
- Tier 3（DetailOverlay）：只迁文本/间距，banner/poster/scroll 主结构与刚修好的滚动行为完全不动

DetailOverlay 上一个变更刚改过结构（unified scroll），动它有回归风险且收益有限——结构层 CSS 本来就是少量、稳定的。

### 5. 保留 CSS 按组件 co-located

```
src/renderer/src/page/library/
├── Hero.tsx
├── Hero.css           ← 仅 Hero 用的 ::after / keyframes
├── DetailOverlay.tsx
├── DetailOverlay.css  ← 仅 DT 用的 scroll / banner / poster / keyframes
├── EpisodeGrid.tsx
├── EpisodeGrid.css    ← 复合状态需要的 :has / 状态嵌套
└── ...

src/renderer/src/styles/
├── library.css        ← 仅剩 :root/.dark token 真值、library-shell 根容器、跨组件 scrim
├── sidebar.css        ← 大部分迁完，剩个别（如 active 指示器）
└── app-header.css     ← 大部分迁完
```

理由：找 Hero 的样式直接到 Hero.css，不用翻 1154 行大文件；CSS 文件大小自然界定为「这个组件的复杂度」。

### 6. 增量提交策略

```
PR 1 = B（token 桥接） + A1（Tier 1: 卡片类 7 个）
PR 2 = A2（Tier 2: Hero / EpisodeGrid / LibraryShell）
PR 3 = A3（DetailOverlay 轻迁移） + A4（清理、文档、CLAUDE.md）
```

PR 1 是最大块，原子提交利于回滚；后续 PR 在 PR 1 基础上增量。

## 风险与权衡

| 风险 | 影响 | 缓解 |
|---|---|---|
| 视觉回归（尤其 dark mode） | 中-高 | 每组件迁完手动切深色对比；保留 git diff 便于回退 |
| className 字符串过长 | 中 | 用 `cn()` 分行；超 ~80 字符必须拆 |
| Tailwind 桥接后真值未在 `:root` 同步 | 高 | 桥接前先全表扫描 token；编写检查脚本（grep 出所有 `--library-*` 声明） |
| DetailOverlay 动 keyframes 引发滚动 / 动画破坏 | 中 | Tier 3 明确规则只迁文本/间距，主结构不动 |
| 短期内 hybrid 阶段两套语法并存 | 低 | 中间状态会有 ~1 周；CLAUDE.md 写清晰；分级迁移可加速度过 |
| Tailwind 词典爆炸 | 低 | 只桥接实际使用的 token；保留 grep + 验证脚本 |

**权衡：**

- 选择 `@theme` 引用 var 而不是直接放真值 → 增加一层指向，但换得 dark mode 行为不变 + 职责清晰
- 选择「按 Tier 分级」而非「一次全迁」 → 多了 3 个 PR 的协调成本，换得回归风险可控
- 选择 `data-*` 而非 className 状态拼接 → 写法稍冗，但与 shadcn 风格一致
- 选择保留 ~300 行 bespoke CSS 而非「100% Tailwind」 → 接受混合范式，因为强行 utility 化复杂选择器会比 CSS 更难读
