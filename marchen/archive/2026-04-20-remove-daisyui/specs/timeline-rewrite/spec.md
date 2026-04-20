### 需求: 系统 SHALL 用纯 Tailwind 布局重写 Timeline 组件

移除 daisyUI 的 `timeline`、`timeline-box`、`timeline-start`、`timeline-end`、`timeline-middle` 类，改用 flex 布局实现相同的视觉效果。

#### 场景: Timeline 渲染正确的步骤结构

WHEN 弹幕加载页面显示
THEN 显示 5 个步骤（视频导入、计算哈希、匹配动漫、获取弹幕、准备播放）
AND 步骤之间有连接线
AND 每个步骤有圆形图标和文字标签

#### 场景: Timeline 高亮已完成步骤

WHEN 加载进度推进到第 N 步
THEN 第 0 到第 N 步的图标和连接线显示高亮色
AND 第 N+1 步及之后保持默认色

#### 场景: Timeline 不使用任何 daisyUI 类名

WHEN 在 `Timeline.tsx` 中搜索 `timeline-`、`timeline `
THEN 搜索结果为空
