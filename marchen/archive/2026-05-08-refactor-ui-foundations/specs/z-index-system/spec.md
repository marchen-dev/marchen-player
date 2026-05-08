## 目的

建立全局 z-index 层级体系，让所有浮层组件（Dialog、Popover、Select、Tooltip、ModalStack、Toast）遵循统一规则，避免层级冲突。

### 需求: 定义明确的层级规范

系统 SHALL 定义清晰的 z-index 层级，不同类型的浮层有固定的层级区间。

#### 场景: 层级从低到高排列

- **GIVEN** 系统中有多种浮层类型
- **WHEN** 查看层级定义
- **THEN** 层级按语义从低到高排列：ModalStack (100) < Dialog (200) < Popover/Select (250) < Tooltip (280) < Toast (300)
- **AND** 每种浮层都有明确的所属层级

### 需求: 层级定义集中管理

系统 SHALL 将 z-index 值集中定义在两个对应的位置（CSS 变量和 TS 常量），保持值同步。

#### 场景: CSS 变量可用于 Tailwind arbitrary value

- **GIVEN** 一个组件需要设置 z-index
- **WHEN** 使用 Tailwind 的 `z-[var(--z-xxx)]` 语法
- **THEN** 能够正确引用全局定义的 CSS 变量

#### 场景: TS 常量可用于 inline style

- **GIVEN** 组件需要动态计算 z-index（如 ModalStack 的 100 + stackIndex）
- **WHEN** 通过 inline style 设置 zIndex
- **THEN** 能引用 TS 常量进行计算

### 需求: 浮层组件正确分层

系统 SHALL 确保浮层组件在嵌套场景下的可见性符合层级规则。

#### 场景: Dialog 嵌套在 ModalStack 中能正常显示

- **GIVEN** 用户打开了 ModalStack 级别的设置弹窗
- **WHEN** 在设置内触发一个 Dialog（如 AI Provider 编辑）
- **THEN** Dialog 及其 overlay 完全覆盖在 ModalStack 之上

#### 场景: Popover/Select 在 Dialog 内正常显示

- **GIVEN** Dialog 已打开
- **WHEN** 在 Dialog 内触发 Popover 或 Select 下拉
- **THEN** 下拉内容显示在 Dialog 内容之上
- **AND** 不被 Dialog 的 overlay 遮挡

#### 场景: Toast 永远显示在最上层

- **GIVEN** 任意数量的浮层已打开（ModalStack、Dialog、Popover）
- **WHEN** 触发一个 Toast 提示
- **THEN** Toast 显示在所有其他浮层之上

### 需求: 清理临时硬编码

系统 SHALL 移除之前为应急加的 z-index 硬编码，改为引用统一定义。

#### 场景: ProviderDialog 不再硬编码 z-index

- **GIVEN** 之前 ProviderDialog 手动传入 `className="z-[200]"` 和 `overlayClassName="z-[200]"`
- **WHEN** 新体系建立后
- **THEN** ProviderDialog 不再需要手动传入 z-index 参数
- **AND** 通过 Dialog 组件默认的层级生效
