## 验收后的界面调整

按用户反馈移除链接区域的平台说明文案；来源长标题改为单行省略，链接类型标签与条数放在下一行。原生 title 提示未按预期弹出，改为显式 Tooltip，鼠标悬停 250ms 或键盘聚焦可显示完整来源名称和条数。

Electron 独立测试窗口已实际验证悬停显示、移开隐藏和键盘聚焦显示，截图见 followup-evidence/source-tooltip.png。调整后 Web 类型检查、对应文件 ESLint 和 git diff --check 通过。原有验收轮次及人的 accepted 决定保留，不将新增截图写回旧轮次。
