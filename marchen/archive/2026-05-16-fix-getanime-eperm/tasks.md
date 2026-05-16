## 背景

`player:getAnimeInSamePath` handler 中 `fs.readdirSync` 没有 try-catch，当 macOS TCC 拒绝目录访问权限时（EPERM），整个 handler 崩溃。需要加错误处理，权限被拒时降级为只返回当前文件本身。

## 1. 错误处理

- [x] 1.1 给 `getAnimeInSamePath` 的 `readdirSync` 调用加 try-catch，捕获 EPERM/EACCES 时降级返回当前文件
