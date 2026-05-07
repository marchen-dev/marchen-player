## 背景

加载 Timeline 当前只显示步骤名称和完成状态，用户看不到"在加载哪个文件"、"匹配到了什么动漫"等上下文信息。在 stepper 下方加一行副标题，根据当前步骤显示对应的描述文案，提升信息透传。

显示规则：
- importing → "正在导入视频..."
- hashing/matching → 文件名（video.name）
- loading_danmaku → "动漫标题 - 集数标题"
- ready → "动漫标题 - 集数标题 · N 条弹幕"
- error → 错误信息

## 1. 添加步骤描述组件

- [x] 1.1 在 Timeline.tsx 中新增 StepDescription 组件，根据 service state 显示副标题文案
- [x] 1.2 修改 LoadingDanmuTimeLine 布局，将 stepper 和副标题垂直排列，副标题居中显示在 stepper 下方
