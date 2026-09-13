# 字幕 Worker 故障隔离（2026-09-12）

用户样片：[DBD-Raws][日在校园][01][1080P][BDRip][HEVC-10bit][FLAC].mkv。
ffprobe 显示容器只有 HEVC 视频与 FLAC 音轨，字幕来自同目录同名 SRT。

截图堆栈明确显示 libass Worker error 在先，随后 resize 和 dispose 访问 null.postMessage。
核对 @jellyfin/libass-wasm 源码：默认 workerError 调用 onError 后自行 dispose 并抛全局错误；
原适配器仅打印 onError，保留了已失效实例，后续动画帧和 React 清理会再次访问其空 Worker。

修复唯一接入边界：
- 接管库的 Worker error 回调，由适配器统一释放，防止库再次销毁并抛全局错误。
- 错误时先取消实例引用与代次，再释放 Worker/轨道；resize、时钟同步和重复清理均不向页面抛出异常。
- 丢弃旧实例迟到回调，允许手动重新选轨创建新实例；清除失败后的残留字幕。
- 字幕设置显示错误并关闭当前字幕，视频会话继续；同步初始化失败不提交为选轨成功。

验证：
- Electron 构建态和 Electron + Vite 开发态可播放此文件及其同名 SRT，正常路径未复现原始 Worker 故障。
- 在真实字幕 Worker 上派发 error 事件，走与截图相同的错误回调；播放器保持 playing，时间继续增长。
- 设置页显示字幕错误；重新选择同名 SRT 后重新建立字幕实例，仍为 playing。
- 证据：school-days-subtitle.png、subtitle-worker-failure-contained.png、subtitle-worker-failure.json。
- 新增单测覆盖异步错误、迟到回调、销毁自身抛错、resize 抛错及重新选轨恢复。

这证明了 null.postMessage 级联崩溃已被隔离；原始 Worker error 的具体触发因素尚未复现，
不能据此归因为文件损坏、解码格式或开发热更新。
