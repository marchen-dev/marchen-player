## 背景

playerBridge.updateDanmaku 在热更新弹幕时（重新匹配/添加本地弹幕），执行 clear() + updateComments() 后没有重新应用用户的弹幕设置（fontSize、area、duration），导致弹幕字体变成默认大小。DanmakuSource.tsx 中的同类操作正确调用了 setResponsiveSettingsUpdate，需要对齐。

## 1. 修复 updateDanmaku 回调

- [x] 1.1 在 hooks.tsx 的 updateDanmaku 回调中，updateComments 后重新应用 danmakuFontSize、danmakuDuration、danmakuEndArea 设置
