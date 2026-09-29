# 引擎验证记录

日期：2026-09-29。范围：任务 1.1–1.3；任务 1.4 仅完成开发态 utilityProcess 探针。不是产品实现完成或安装包验收。

## 版本与安装

- 锁定 webtorrent 3.0.21，声明 Node >=22；实际 Node 24.20.0 / macOS ARM64 可导入并运行。
- 精确锁定验证脚本依赖 parse-torrent 11.0.24、bencode 4.0.1。
- WebTorrent 通过 webrtc-polyfill 引入 node-datachannel 0.32.3。Node 端静态加载该原生模块，即使此验证不启用 WebRTC。
- 允许 node-datachannel 安装脚本，预编译 N-API 包在本机加载成功；utp-native 构建暂不启用，探针显式 utp:false，仅验证 TCP，不声称 uTP 已支持。
- 没有实现浏览器下载，也未将下载代码导入 Web 构建。

## 格式矩阵

| 输入 | 结果 | 首版策略 |
| --- | --- | --- |
| 自建 BT v1 多文件 torrent | 解析、TCP 传输、文件 hash 验证通过 | 支持候选已验证 |
| v1 magnet | 通过本地 peer 获得元数据，确认前零有效载荷 | 支持候选已验证；公网发现未测 |
| 最小纯 v2 元数据 | parse-torrent 报缺少 info.pieces | 不支持，产品输入层须给明确提示 |
| 在 v1 元数据附加 meta version=2 的探针 | 解析器仍按 v1 解释 | 不能证明混合种子兼容；首版输入层明确拒绝 meta version=2，待任务 3.2 落实 |

混合探针不是合规混合种子 fixture，不能据此宣称混合下载支持。v2 与混合种子不列入首版已支持能力。

## 可复现验证

使用 Node 24 执行 `pnpm test:downloads:engine`，脚本生成随机字节样片、种子及本地 TCP seeder，不访问公网 tracker，不读取用户视频；产物留在 `.tmp/test-results/downloads/`。

成功运行输出：`.tmp/test-results/downloads/engine-VxjREO/result.json`。

通过项目：
1. v1 元数据解析和两个文件的列表。
2. 纯 v2 拒绝及混合字段风险探针。
3. 连上 peer 后未选文件时，等待期间有效载荷下载为零。
4. 选择首文件并下载部分数据后 remove({destroyStore:false})；销毁完成、wire 数为零，seeder 上传计数停止增长。
5. 销毁并重建 client，自动校验恢复此前已验证片段。
6. 第一文件完成且 SHA-256 与源字节相等；第二文件未完成，torrent.done 仍为 false。
7. 独立接收进程写入部分已验证片段后 SIGKILL，重建后重新校验并复用落盘片段。
8. v1 magnet 经本地 peer 获得元数据，未确认前仍为零有效载荷。

实现注意：WebTorrent 3.0.21 的 downloaded getter 包含未校验的 in-progress 数据，与官方文档概括有差异。脚本按 bitfield 已校验片段计算恢复基准，正式完成判断不可仅依赖 downloaded==length。

## Electron 开发态探针

`pnpm test:downloads:utility` 输出：

```json
{"ok":true,"node":"24.18.1","electron":"44.0.0","platform":"darwin","arch":"arm64","action":"WebTorrent TCP listener opened and closed in utilityProcess"}
```

此探针无窗口，只验证 utilityProcess 的模块加载、原生依赖、TCP 监听启动与关闭。不是完整下载、asar、签名或安装包验证。

## 阻塞与下一步

任务 1.4 要求 macOS ARM64 与 Windows x64 打包后的进程验证，并注明“未通过不得进入后续集成”。本机尚未完成 macOS 打包验证，也无已配置的 Windows x64 实机运行环境；不能用交叉打包替代 Windows 运行证据。

保留 1.4 未勾选，后续业务/UI 任务未开始。建议通过 marchen-update 将双平台安装包运行验收放至第 6 组，前置门槛保留本机引擎/开发态进程验证；或提供 Windows 验证环境后继续原门槛。未经用户确认不修改原计划门槛。
