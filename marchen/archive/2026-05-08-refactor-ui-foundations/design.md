## 背景

项目使用 shadcn/ui 的手动复制模式（无 `components.json`），依赖 17 个独立的 `@radix-ui/react-*` 包。同时项目有一个自定义的 ModalStack 系统（z-index 从 100 开始动态递增），和 shadcn 默认的 `z-50` 层级冲突，导致最近实现 AI Settings Tab 时出现 Provider Dialog 被 ModalStack 遮挡的问题。目前的"修复"是在 ProviderDialog 里硬编码 `z-[200]`，是临时方案。

当前 Radix import 模式：

```typescript
import * as DialogPrimitive from '@radix-ui/react-dialog'
const Dialog = DialogPrimitive.Root  // 本地重命名
```

当前 z-index 分布：
- ModalStack: 100 + index
- Dialog overlay/content: z-50（默认）
- Popover: z-50 → 临时改到 z-[250]
- Select: z-[150] → 临时改到 z-[250]
- Tooltip: z-50

## 目标与非目标

**目标：**
- 将 17 个 `@radix-ui/react-*` 包合并为 1 个 `radix-ui` 统一包
- 建立集中管理的 z-index 层级体系
- 所有浮层组件迁移到新 z-index 体系
- 保持组件 API、行为、视觉完全不变

**非目标：**
- 不升级组件功能或改 API（纯基础设施重构）
- 不改目录结构（保持 `ui/dialog/Dialog.tsx` 的目录组织方式）
- 不替换 toast 组件（sonner 迁移另做）
- 不改 shadcn 组件的样式和交互逻辑

## 决策

### 1. Radix 统一包的 import 策略

采用 **as 别名** 方式，最小改动：

```typescript
// 改前
import * as DialogPrimitive from '@radix-ui/react-dialog'

// 改后
import { Dialog as DialogPrimitive } from 'radix-ui'
```

**理由：**
- 不动组件内部代码（`DialogPrimitive.Root` 等引用全部保留）
- 唯一改动是 import 行，diff 最小
- 避免命名冲突（组件已有 `const Dialog = DialogPrimitive.Root`）

**替代方案（不选）：** 直接用 `import { Dialog } from 'radix-ui'`。这样会和组件内 `const Dialog = ...` 重命名冲突，需要大幅改动组件内部。

### 2. z-index 双份定义（TS 常量 + CSS 变量）

```typescript
// src/renderer/src/lib/constants/z-index.ts
export const Z_INDEX = {
  modalStack: 100,
  dialog: 200,
  popover: 250,
  tooltip: 280,
  toast: 300,
} as const
```

```css
/* src/renderer/src/styles/shadcn.css */
:root {
  --z-modal-stack: 100;
  --z-dialog: 200;
  --z-popover: 250;
  --z-tooltip: 280;
  --z-toast: 300;
}
```

**理由：**
- 纯 CSS 组件（Dialog、Popover）用 `z-[var(--z-xxx)]` 语法引用 CSS 变量
- 需要动态计算的地方（ModalStack 的 `100 + index`）用 TS 常量
- 两份定义通过代码注释互相标注，虽有重复但实际场景最灵活

**替代方案（不选）：**
- **只用 TS 常量**：inline style 会让 Tailwind 体系不统一，debug 视觉层级不方便
- **只用 CSS 变量**：ModalStack 的动态计算没法纯 CSS 实现

### 3. 层级规划

```
层级              值       用途
─────────────────────────
base              0        基础内容
sticky            20       粘性元素
dropdown          30       普通下拉
header            40       固定顶栏
overlay           50       一般遮罩
modalStack        100+     ModalStack 层（实际值 = 100 + stackIndex）
dialog            200      shadcn Dialog（覆盖 ModalStack）
popover           250      Popover / Select（在 Dialog 内部）
tooltip           280      Tooltip（在 Popover 之上）
toast             300      Toast（永远最上层）
```

**理由：** 每个层级之间留出 50 以上空间，应对未来扩展。ModalStack 的 100-199 区间足够支持近 100 层堆叠。

### 4. 分阶段实施（单 PR，多 commit）

在一个 change / 一个 PR 内分两个 commit：
1. `refactor: migrate to unified radix-ui package` — 只改 import
2. `refactor: unify z-index system with CSS variables` — 建立 z-index 体系并清理硬编码

**理由：** 两个改动虽然合并到一个 PR，但职责分离。出问题时可以 git bisect 到具体 commit。

### 5. 验证策略

- TypeScript typecheck 全程必须通过
- 启动 dev server（Web + Electron）手动验证关键场景：
  - 设置弹窗（ModalStack）打开
  - AI Settings 里添加 Provider（Dialog in ModalStack）
  - 类型选择下拉（Select in Dialog）
  - 模型搜索 Popover（Popover in Dialog）
  - 各 Toast 提示

## 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| Radix 统一包某些子组件导出名与预期不符 | 编译错误 | 先改 1-2 个组件做 spike，确认 API 后批量改 |
| 业务代码 (`modules/`) 直接引用 Radix，容易漏改 | 运行时错误 | grep 全局搜索 `@radix-ui/react-` 确保全部迁移 |
| Tailwind `z-[var(--z-dialog)]` 在 Tailwind v4 下失效 | z-index 错误 | 先 spike 验证语法支持，必要时降级为 inline style |
| TypeScript 类型签名微妙变化 | 类型错误 | typecheck 全程通过；出错时对应调整类型声明 |
| ModalStack 的 `100 + index` 和 Dialog 的 200 冲突 | 第 100 层后的 ModalStack 会超过 Dialog 层级 | 实际不会有 100 层嵌套；文档明确 ModalStack 限制 |
| 迁移过程中 PR 巨大，review 困难 | review 质量下降 | 分两个清晰的 commit；改动 99% 是机械替换 |
| 已有临时硬编码（如 ProviderDialog 的 z-[200]）清理不干净 | 特殊场景失效 | 迁移最后一步全局搜索 `z-\[[0-9]` 确认无残留 |
