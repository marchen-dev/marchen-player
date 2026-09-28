## 背景

`components/ui/dialog`（URL 播放、手动匹配番剧、AI 服务商配置在用）遮罩为 `bg-black/80`，浅色主题下压成死灰；进场动画叠加旧式 `slide-in-from-left-1/2` / `slide-in-from-top-[48%]`，与 transform 居中叠加导致斜滑。`components/ui/modal/stacked`（设置、确认框）则是浅色雾面遮罩 + 回弹明显的弹簧，两套视觉语言不统一。

方案：保留两套组件各自职责，统一视觉 token。
- 遮罩：深色半透明（浅色 `black/40`、暗色 `black/60`），`backdrop-blur-[2px]`，适合覆盖在视频上
- 面板：Dialog 保持实心背景，改为柔和大阴影 + `rounded-xl` + 淡边框
- 动画：进场 opacity 0→1 / scale 0.96→1 / y 4px→0，180ms `cubic-bezier(0.16,1,0.3,1)`；退场 120ms 淡出轻缩小、无位移
- 抽共享常量，Dialog 用 CSS 动画、ModalStack 用 framer-motion 复用同一参数

## 1. 共享视觉 token

- [x] 1.1 新增弹窗共享常量（遮罩 class、缓动曲线、时长、motion 进退场参数）
- [x] 1.2 在 tailwind.css 定义 dialog 进场/退场 keyframes 与 animate 工具

## 2. 应用到两套弹窗

- [x] 2.1 `ui/dialog`：替换遮罩与动画，去掉斜滑，面板改为柔和阴影与圆角
- [x] 2.2 ModalStack：遮罩与开关动画改用共享参数，保留拖拽回弹逻辑

## 3. 验证

- [x] 3.1 typecheck / lint 通过
- [x] 3.2 DevTools 截图检查浅色、暗色下 URL 播放弹窗与设置弹窗
