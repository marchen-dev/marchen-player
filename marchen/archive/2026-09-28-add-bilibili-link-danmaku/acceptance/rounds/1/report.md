# 验证说明

实际通过 Electron Main IPC 请求 B 站，未读取或携带登录 Cookie。三个用户 BV 链接均成功；SS 返回 13 集候选，EP 第 2 集成功导入。界面验证使用仓库已有 90 秒测试图视频，不是番剧画面，不声称时间轴已与实际番剧对齐。

测试目录：.tmp/bilibili-e2e-profile。Chrome 占用 9222，使用 electron-vite 的 remoteDebuggingPort 参数启动独立 9333 端口，通过 Playwright CDP attach 取证；未改日常窗口、源码调试端口或 MCP 配置。可用工具中没有 Chrome DevTools MCP。

自动匹配服务本次请求失败，采用现有“直接播放”进入播放器；重开也点直接播放恢复。这不影响 B 站独立接口验证，但不代表自动匹配服务已验证通过。

正常检查：Node 24.20.0；主进程 135 项、运行时 210 项测试通过；双端类型检查、变更文件 lint、Electron 与 Web 构建通过。构建仅产生本地输出，未发布，未验证 Windows 安装包。Web 维持不提供链接导入的既有边界，本次未重新进行 Web 文件导入交互验证。

设计补充：实际长番剧标题撑出来源按钮，已在本次变更中限制按钮宽度并截断标题，悬停仍可看完整标题。所有已有无关修改保留。截图 episode-import 是导入初次取证，来源按钮布局以 restored 截图的最终修复为准。
