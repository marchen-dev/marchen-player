## 背景

播放 Jellyfin / Emby 媒体源视频时，字幕设置面板顶部显示「远程视频暂不支持内嵌字幕」，但这类来源的内嵌文字字幕由服务端抽取后作为 `provider:` 轨道提供，实际可以选择和渲染，提示与事实矛盾。

原因是提示直接取自 `supportsEmbeddedSubtitles(source)`（`!isRemoteKind`），它表达的是「是否在本地提取内嵌字幕」，不等于「用户能否用到内嵌字幕」。

方案：保留本地提取策略不变，在 `source-policy.ts` 新增 `embeddedSubtitlesAvailable`：本地来源或 provider 为 Jellyfin / Emby 时视为可用；WebDAV 与远程直链仍显示提示。字幕 context 的 `embeddedSupported` 改用新函数，UI 不改。图片字幕（PGS 等）被服务端过滤后无提示的情况本次不处理。

## 1. 提示判定

- [x] 1.1 `source-policy.ts` 新增 `embeddedSubtitlesAvailable`，本地提取的 `supportsEmbeddedSubtitles` 保持不变
- [x] 1.2 `subtitles/context.tsx` 的 `embeddedSupported` 改用新函数

## 2. 测试与验证

- [x] 2.1 `embedded-subtitle-policy.test.ts` 覆盖本地、Jellyfin、Emby、WebDAV、远程直链五种来源的判定
- [x] 2.2 运行 typecheck、lint 与 player-runtime 字幕相关测试
