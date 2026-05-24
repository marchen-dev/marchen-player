## 目的

定义 library hero banner 与透明 AppHeader 融合渲染的视觉契约，保证 cinematic 效果在 light/dark 双主题下都不产生色带或可读性问题。

### 需求: hero 内容渗入 header 下方

library 路由下，hero banner 顶部 SHALL 在视觉上延伸到 AppHeader 区域的下方，使 AppHeader 透出 hero 的色彩。

#### 场景: hero 顶部延伸

- **GIVEN** 用户在 library 路由，hero banner 已加载一张作品海报
- **WHEN** 用户视线在 AppHeader 区域
- **THEN** AppHeader 背景 MUST 透出 hero 顶部的色彩（不是纯白/纯黑）
- **AND** 红绿灯仍 MUST 清晰可辨

### 需求: 文字可读性

AppHeader 上的 title 与 actions 在 hero 渗入时 SHALL 通过 backdrop blur 或半透明遮罩保持足够对比度。

#### 场景: 高亮 hero 配深色 title

- **GIVEN** light 主题下，hero 是一张明亮的作品海报
- **WHEN** AppHeader title 显示"影视库 8"（深色文字）
- **THEN** title 文字 MUST 在 hero 透出的色彩上保持 ≥ 4.5:1 的对比度
- **AND** 如对比度不够，AppHeader MUST 通过半透明白色遮罩或 blur 补齐

#### 场景: 暗色主题下的 hero blend

- **GIVEN** dark 主题，hero 是一张作品海报
- **WHEN** AppHeader title 显示白色文字
- **THEN** title 文字 MUST 在 hero 上保持 ≥ 4.5:1 的对比度
- **AND** AppHeader MUST 通过半透明深色遮罩或 blur 补齐

### 需求: 非 library 页不渗入

非 library 路由 SHALL 不出现 hero 渗入 header 的视觉，AppHeader 在这些页面上 MUST 使用纯色背景（与页面背景一致）。

#### 场景: player 路由 header 背景

- **GIVEN** 用户在 player 路由
- **WHEN** AppHeader 渲染
- **THEN** AppHeader 背景 MUST 与 player 主区背景一致（纯色，无渗入效果）
- **AND** AppHeader 与主区 MUST 仅由底部 1px 分隔线划分
