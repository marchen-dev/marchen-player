# 第三方文件：Bergamot 翻译引擎胶水脚本

`bergamot-translator.js` 是 Mozilla 为 Firefox 网页翻译功能生成的 Emscripten 胶水脚本，
原样收录，**禁止手工修改**（文件头注明 AUTO-GENERATED）。它只定义一个全局函数
`loadBergamot(Module)`，由 `../engine/translator.worker.ts` 以源码文本方式载入。

| 项 | 值 |
| --- | --- |
| 上游仓库 | `mozilla-firefox/firefox` |
| 上游路径 | `toolkit/components/translations/bergamot-translator/bergamot-translator.js` |
| 上游提交 | `48d55cf7ec80093903e2ef7f58b61a84a22ef716`（2026-01-29） |
| 引擎内部版本 | `v0.6.0+eea6e5a8` |
| 本文件 SHA-256 | `faff1ef6285b0d26f01787776fd49299dfb756ecb9688aa990c250e66797b47d` |
| 配套 WASM | Firefox 远程设置 `translations-wasm-v2` 中的 `bergamot-translator` 4.0 |
| 配套 WASM SHA-256 | `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926` |
| 许可证 | MPL-2.0（见文件头），源码在 https://github.com/mozilla/translations |

配套的 WASM 与翻译模型不在仓库内，运行时从翻译资源存储桶下载并按
`../assets/manifest.ts` 中的 SHA-256 校验。胶水脚本与 WASM 必须成对升级：
替换本文件时同步更新上表与清单里的引擎版本、哈希。
