# Electron 实机部分验收（8.2 / 8.5 的一部分）

日期：2026-11-09
环境：`electron-vite dev`（调试端口临时改为 9223，因 9222 被本机 Chrome 占用；未改项目配置），macOS，本地 SSD
样本：《你的名字》UHD BluRay Remux（唯一样本；补充样本按决定推迟到 8.2 前）
驱动方式：CDP 脚本 `.tmp/pgs-gate/cdp.mjs`（调用 `getPlayerLoadingService().loadFromPath` 打开视频、`showPlayerSettingsPanel('subtitle')` 打开字幕面板，Radix Select 用指针事件选择）
截图：含影片画面，验收后已删除，不提交

## 结果

| 检查项 | 结果 |
|---|---|
| 字幕列表 | 6 条 PGS 轨（chs&jpn、cht&jpn、chs Mandarin、cht Mandarin、cht BD、eng）全部可选，不再带“（暂不支持）” ✓ |
| 选中 chs&jpn 后显示 | 1:20:05 处画面底部居中显示“怎么样 / どうかな”，位置与比例正确，浅灰白色与 mpv 基准观感一致 ✓ |
| 字幕大小 | 选中 PGS 后滑块与重置按钮禁用，显示“图片字幕不支持调整大小”；全局值仍为 100% ✓ |
| 选择记忆 | 关闭播放后重新打开同一视频，自动恢复 chs&jpn ✓ |
| 遥测 | 开发日志出现 `subtitle_bitmap_session`：mode=index、hdr=true、first_bitmap_ms=229、read_bytes≈6.7 MB、max_backtrack=1、无失败、stats_missing=false ✓ |

## 未覆盖（仍需完成）

- Web 端；兼容内核与原生内核分别验证（本次日志 engine=native）；
- 跳到 10 / 50 / 100 分钟各 5 次的首张字幕耗时（8.2）；
- 片尾曲 24 fps 段连续播放、内存（8.3）；20 分钟连续播放加 20 次往返跳转（8.4）；
- 时间偏移、与外挂 ASS 互斥（8.5，外挂导入需要文件对话框，未自动化）；
- 补充样本（1.4）。

## 过程备注

驱动脚本第一次查找“关闭”按钮时误点了“关闭当前播放”，播放被关闭后重新打开，没有其他影响。
