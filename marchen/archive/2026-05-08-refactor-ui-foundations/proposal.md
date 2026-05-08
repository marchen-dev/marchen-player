## 动机

项目的 shadcn UI 组件随着时间推移积累了一些基础性问题：

1. **依赖臃肿**：17 个独立的 `@radix-ui/react-*` 包，package.json 冗长，升级维护不便
2. **z-index 体系混乱**：组件的 z-index 值散落各处（z-50、z-150、z-200、z-250），没有统一规则。最近为了解决 Provider Dialog 被 ModalStack 遮挡问题，临时在组件层硬编码提高 z-index，缺乏全局规划
3. **ModalStack 和 shadcn 层级冲突**：自定义 ModalStack（z-index 100+）和 shadcn 原生组件（z-50）层级不匹配，导致 Dialog 嵌套场景下频繁出现遮挡问题

现在做这个重构的时机合适：AI Settings Tab 刚上线暴露了层级问题，趁记忆还新，建立统一规范。

## 变更内容

- 迁移所有 `@radix-ui/react-*` 到统一的 `radix-ui` 包
- 建立全局 z-index 体系（CSS 变量 + TS 常量双份同步）
- 更新所有浮层组件（Dialog、Popover、Select、Tooltip、ModalStack）使用统一层级
- 清理之前为应急加的硬编码 z-index（如 ProviderDialog 里的 `z-[200]`）

不涉及：
- 不升级组件功能（API 保持不变）
- 不改目录结构（保持 `ui/dialog/Dialog.tsx` 目录式组织）
- 不替换 toast 组件（后续独立变更）

## 能力

### 新增能力

- `radix-ui-unified`：使用统一的 `radix-ui` 包替代分散的独立包，保持组件行为不变
- `z-index-system`：建立全局 z-index 层级规范，所有浮层组件遵循统一规则

### 修改能力

- 无（只是基础设施重构，不改变用户可见行为）

## 影响范围

**依赖变化：**
- 移除 17 个 `@radix-ui/react-*` 包
- 新增 `radix-ui` 统一包

**代码改动：**
- `src/renderer/src/components/ui/` 下所有使用 Radix 的组件（17 个文件）import 语句重写
- `src/renderer/src/components/modules/` 下少量直接引用 Radix 的业务文件（如 `DanmakuSource.tsx`、`SettingSlider.tsx`）
- 新建 `src/renderer/src/lib/constants/z-index.ts`
- 修改 `src/renderer/src/styles/shadcn.css` 添加 z-index CSS 变量
- 更新 Dialog、Popover、Select、Tooltip、ModalStack 组件使用新 z-index 体系
- 清理 `components/modules/settings/views/ai/ProviderDialog.tsx` 的临时 z-index 硬编码

**不影响：**
- 组件 API 和用法
- 已有的视觉和交互行为
- 非浮层组件（Input、Button、Switch 等）
