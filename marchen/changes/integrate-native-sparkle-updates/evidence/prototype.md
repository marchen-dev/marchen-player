# ARM64 原型记录

2026-09-23，本机 macOS ARM64，Electron 44.0.0、官方 Sparkle 2.10.0。

- 官方发布包 SHA256：c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c。
- 原生模块编译成功；须显式选取 xcrun 返回的 SDK，避免 Xcode 编译器与 CommandLineTools SDK 混用。
- A/B 使用独立 com.suemor.marchen.sparkle-prototype bundle ID、独立 userData、loopback 更新源和一次性 Ed25519 私钥。正式播放器未启动/覆盖。
- 两份 app 执行 codesign --verify --deep --strict 成功，再归档 ZIP；不代表 Gatekeeper 首次安装通过。
- 简体原生窗口真实显示 0.0.1 → 0.0.2，下载后显示“安装并重启应用”。
- 保存失败模拟：prepare-install → save-failed，旧进程保持运行；约 16 秒后点击显式重试，saved-after-retry → will-relaunch → before-quit → will-quit → 新 PID 的 started 0.0.2。
- 更新后的原路径 Info.plist 和 Electron 窗口均为 0.0.2。
- 繁体语言重启后真实显示“您已有最新版本”。
- 官方 gentle-reminder delegate 在模拟播放时返回 NO，后台检查记录 notice-deferred 且无原生窗口；停止播放后调用标准检查入口，原生新版本窗口显示。

关键 API：SPUStandardUpdaterController；standardUserDriverShouldHandleShowingScheduledUpdate:andInImmediateFocus:；standardUserDriverWillHandleShowingUpdate:forUpdate:state:；shouldPostponeRelaunchForUpdate:untilInvokingBlock:。

注意：官方头文件明确 postpone-relaunch 回调不保证覆盖不重启/先前延后安装等路径。正式应用仍需 before-quit 保存保护，不能把此回调当作所有退出路径的唯一屏障。原型只有模拟持久化，真实播放器、自动授权、篡改拒绝、差分、Windows、DMG/Gatekeeper 等尚未验证。

## 官方直接差分补充

官方 generate_appcast 生成 0.0.2 ← 0.0.1 的 1538 字节 .delta。loopback HTTP 服务记录实际 GET 该 .delta；本次未请求全量 ZIP。原生窗口显示“可以开始安装了”，用户操作安装并重启后记录：

- 11:29:08.346Z prepare-install（PID 68031 / A）
- 11:29:08.869Z saved
- 11:29:08.874Z will-relaunch
- 11:29:08.998Z will-quit
- 11:29:11.060Z started（PID 87085 / B 0.0.2）

窗口截图 delta-updated-version.png 同样显示 0.0.2。该结果证明标准官方直接差分在隔离 ad-hoc 原型可工作，不等于真实播放器历史保存或差分失败自动恢复已通过。
