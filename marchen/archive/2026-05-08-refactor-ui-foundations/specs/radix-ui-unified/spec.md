## 目的

使用统一的 `radix-ui` npm 包替代多个独立的 `@radix-ui/react-*` 包，简化依赖管理并保持所有组件行为不变。

### 需求: 单一依赖源

系统 SHALL 仅依赖统一的 `radix-ui` 包提供 Radix primitive，不再使用独立的 `@radix-ui/react-*` 包。

#### 场景: 依赖清单只保留统一包

- **GIVEN** 项目的 package.json
- **WHEN** 检查 Radix 相关依赖
- **THEN** 应只包含 `radix-ui` 一个包
- **AND** 不包含任何 `@radix-ui/react-*` 形式的独立包

### 需求: 保持组件行为不变

系统 SHALL 在迁移后保持所有使用 Radix primitive 的组件的行为、API 和视觉表现完全一致。

#### 场景: Dialog 组件行为保持

- **GIVEN** 迁移前 Dialog 组件可以打开、关闭、展示内容
- **WHEN** 迁移到统一 `radix-ui` 包
- **THEN** Dialog 仍然可以正常打开、关闭、展示内容
- **AND** 所有 props（open、onOpenChange、onInteractOutside 等）行为一致

#### 场景: 所有浮层组件行为保持

- **GIVEN** 迁移前 Popover、Select、Tooltip、Dropdown 等组件工作正常
- **WHEN** 迁移到统一 `radix-ui` 包
- **THEN** 所有这些组件继续正常工作
- **AND** 不引入新的运行时错误

### 需求: 业务代码兼容

系统 SHALL 确保 `components/modules/` 下直接引用 Radix 的业务代码在迁移后仍能正常工作。

#### 场景: 业务组件的类型导入

- **GIVEN** 业务文件（如 SettingSlider、DanmakuSource）从 `@radix-ui/react-*` 导入类型
- **WHEN** 迁移到统一包
- **THEN** 这些文件改为从 `radix-ui` 导入对应类型
- **AND** TypeScript 类型检查通过

### 需求: TypeScript 类型检查通过

系统 SHALL 在迁移完成后通过所有 TypeScript 类型检查。

#### 场景: 执行 typecheck

- **GIVEN** 迁移完成后的代码库
- **WHEN** 运行 `pnpm typecheck`
- **THEN** 无新增类型错误（已有历史错误除外）
