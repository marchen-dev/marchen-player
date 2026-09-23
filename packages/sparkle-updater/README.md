# Marchen Sparkle 桥接

仅供 macOS ARM64 主进程使用，使用官方 Sparkle 2.10.0 与标准原生窗口。

- Node 24 执行 `node packages/sparkle-updater/scripts/build.mjs`，需要 Xcode/CLT。
- Framework 和头文件下载均校验；vendor/build 被忽略，不提交二进制。
- `loadSparkleBridge` 的路径只由可信主进程提供。`initialize` 在 app ready 后且只调用一次。
- `automaticChecks()` 读取偏好，传布尔值才改变偏好，不默认越过原生授权。
- `setPlaying` 配合官方 gentle-reminder delegate；主动检查始终可打开窗口。
- `prepare-install` 只表示 Sparkle 请求准备，必须保存成功后才调用 `resumeInstall`。
- 官方 postpone 回调不覆盖全部退出路径，宿主必须另设退出保存保护。
- 包装器不实现安装器、差分算法和多跳差分；正式 feed 必须 HTTPS，配置来自签名后的 Info.plist。

## 隔离原型

构建后执行 `node packages/sparkle-updater/scripts/prototype.mjs`，生成 `.tmp/sparkle-prototype` 两个应用及一次性测试密钥。目录已存在时拒绝覆盖原型包。仅监听本机的测试服务器可使用：

```
python3 -m http.server 18746 --bind 127.0.0.1 --directory .tmp/sparkle-prototype
```

测试应用使用独立 bundle ID 和 userData；原型有模拟保存失败/重试菜单，不能作为正式历史持久化实现。私钥不能复制进变更证据或提交。
