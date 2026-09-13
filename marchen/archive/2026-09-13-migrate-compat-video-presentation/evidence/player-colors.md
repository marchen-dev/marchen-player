# 播放器弹层颜色修复

在独立 Electron 开发窗口、应用 light 主题下打开真实视频，复现来源菜单与匹配弹窗白底白字。仅给 PlayerShell 加 dark 后，计算背景仍是 rgb(255,255,255)，证实 Tailwind @theme 颜色别名在根节点预先解析。

修复：PlayerShell 设局部 dark；shadcn 颜色映射移至 @theme inline，在使用组件处解析变量。保留原断点、字体、动画和其他配置。不修改 player.css 既有工作区内容。

再次实际打开来源菜单和手动匹配弹窗：按钮/弹窗背景 rgb(10,10,10)，文字 rgb(255,255,255)，标题、输入提示及空状态可见。见 player-source-colors.png、player-match-colors.png。应用暗色状态也截取核对；播放器外应用继续使用自身主题。类型检查及 diff check 通过。
