## 1. Radix UI 统一包迁移

- [x] 1.1 安装 `radix-ui` 统一包，spike 验证一个简单组件（Label）迁移可行性
- [x] 1.2 迁移 ui/ 下所有组件的 Radix import（accordion、checkbox、dialog、dropdownMenu、label、menu、popover、progress、scrollArea、select、slider、switch、tabs、toast、toggle、Tooltip、sheet、command、modal/stacked）
- [x] 1.3 迁移 modules/ 下直接使用 Radix 的业务文件（SettingSlider、DanmakuSource）
- [x] 1.4 全局搜索 `@radix-ui/react-` 确保无残留
- [x] 1.5 卸载所有独立 `@radix-ui/react-*` 包
- [x] 1.6 运行 typecheck，修复可能的类型问题
- [x] 1.7 手动验证关键浮层场景（Dialog、Popover、Select、Tooltip、Modal）

## 2. Z-index 体系建立

- [x] 2.1 新建 `src/renderer/src/lib/constants/z-index.ts` 定义 TS 常量
- [x] 2.2 在 `src/renderer/src/styles/shadcn.css` 添加 `--z-*` CSS 变量
- [x] 2.3 更新 Dialog 组件使用 `z-[var(--z-dialog)]`（content 和 overlay）
- [x] 2.4 更新 Popover 组件使用 `z-[var(--z-popover)]`
- [x] 2.5 更新 Select 组件使用 `z-[var(--z-popover)]`
- [x] 2.6 更新 Tooltip 组件使用 `z-[var(--z-tooltip)]`
- [x] 2.7 更新 ModalStack 的 `MODAL_STACK_Z_INDEX` 从 TS 常量导入
- [x] 2.8 更新 Toast 组件使用 `z-[var(--z-toast)]`
- [x] 2.9 清理 ProviderDialog 里的 `z-[200]` / `overlayClassName="z-[200]"` 硬编码
- [x] 2.10 移除 Dialog 组件的 `overlayClassName` prop（如不再需要）
- [x] 2.11 全局搜索 `z-\[[0-9]` 确保无硬编码残留（排除新体系下的 var 引用）

## 3. 验证

- [x] 3.1 TypeScript typecheck 通过（排除历史已有错误）
- [x] 3.2 Web dev server 启动验证：打开设置 → AI Tab → 添加服务商 → 类型下拉 + 模型搜索 → 测试连接 → Toast 提示
- [~] 3.3 Electron dev 启动验证同样场景
- [x] 3.4 确认所有浮层层级正确：ModalStack → Dialog → Popover/Select → Tooltip → Toast
