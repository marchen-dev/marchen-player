## tailwind4-migration

Tailwind CSS 3→4、daisyui 4→5、tailwind-merge 2→3 全量迁移，重写配置文件。

### 需求: Tailwind CSS 配置 SHALL 从 JS 迁移到 CSS-first

Tailwind 4 不再使用 tailwind.config.ts，改为 CSS 中的 @theme 指令。

#### 场景: tailwind.config.ts 被删除

WHEN 查看项目根目录
THEN tailwind.config.ts 不存在

#### 场景: postcss.config.cjs 被删除

WHEN 查看项目根目录
THEN postcss.config.cjs 不存在

#### 场景: tailwind.css 使用 Tailwind 4 语法

WHEN 查看 src/renderer/src/styles/tailwind.css
THEN 包含 `@import "tailwindcss"` 而非 `@tailwind base/components/utilities`

### 需求: 自定义主题配置 SHALL 迁移到 @theme 指令

当前 tailwind.config.ts 中的 theme.extend（颜色、字体、断点、圆角、动画）需要迁移到 CSS @theme 块。

#### 场景: shadcn 颜色体系正常工作

WHEN 页面渲染
THEN 所有使用 hsl(var(--xxx)) 的颜色变量正常显示
AND 亮色（cmyk）和暗色（dark）主题切换正常

### 需求: 自定义工具类 SHALL 使用 @utility 语法

tailwind-extend.css 中的 @layer components 需要改为 @utility。

#### 场景: drag-region 类正常工作

WHEN Electron 窗口渲染
THEN `.drag-region` 元素可拖拽窗口

### 需求: daisyui 5 主题 SHALL 正确配置

daisyui 5 的主题配置方式与 v4 不同，需要适配 cmyk（亮色）和 dark（暗色）主题。

#### 场景: daisyui 组件样式正常

WHEN 页面渲染
THEN daisyui 组件（按钮、卡片等）样式正常
AND 主题切换正常

### 需求: tailwind-merge SHALL 与 Tailwind 4 配套升级

tailwind-merge v3 专为 Tailwind 4 设计，MUST 与 Tailwind 4 同批升级。

#### 场景: class 合并逻辑正常

WHEN 使用 cn() 工具函数合并 Tailwind class
THEN 冲突的 class 被正确合并，无样式异常

### 需求: components.json SHALL 被更新或删除

当前 components.json 中的路径配置已过时。

#### 场景: shadcn 配置不影响运行

WHEN 项目构建
THEN 不因 components.json 配置错误而报错
