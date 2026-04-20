### 需求: 系统 SHALL 将主题从 cmyk/dark 切换到 light/dark

#### 场景: ThemeProvider 使用标准主题名

WHEN 查看 `providers/index.tsx` 的 ThemeProvider 配置
THEN `themes` 为 `['light', 'dark']`
AND `attribute` 仅为 `'class'`（移除 `data-theme`）

#### 场景: 主题 hook 使用 light 替代 cmyk

WHEN 查看 `hooks/theme.ts`
THEN `AppTheme` 类型为 `'light' | 'dark' | 'system'`

#### 场景: DarkMode 切换组件使用 light 主题值

WHEN 用户在设置中切换到白天模式
THEN 发送的主题值为 `'light'` 而非 `'cmyk'`

---

### 需求: 系统 SHALL 在主进程中正确处理 light 主题

#### 场景: main 进程 setTheme 处理 light 值

WHEN 渲染进程发送 `setTheme('light')`
THEN 主进程将 `nativeTheme.themeSource` 设为 `'light'`

#### 场景: data-theme 属性不再被使用

WHEN 在 `src/` 目录下搜索 `data-theme`
THEN 搜索结果为空
