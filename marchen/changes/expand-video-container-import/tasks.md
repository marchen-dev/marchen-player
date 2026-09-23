## 背景

当前内核使用 MediaBunny 1.59.0 ALL_FORMATS，入口仍多处仅允许 MP4/MKV。统一共享视频后缀列表，放开 MP4/M4V、MOV/QT、MKV/MK3D、WebM、TS/MTS/M2TS/M2T，并接入导入、拖放、列表、历史重选、租约和文件关联。保留字幕类型及租约来源校验；不承诺所有编码可播放。OGG 解复用当前仅支持音频，HLS 多文件访问未接入，本轮不纳入视频入口。

## 1. 实现

- [x] 1.1 建立共享格式列表，替换双端入口与协议限制，同步文件关联与仓库说明
- [x] 1.2 验证新增格式的导入列表、媒体租约和类型检查，记录支持边界

## 验证记录

- 定向 ESLint、node/web 类型检查与 git diff --check 通过。当前 shell 为 Node 22.22.3，仓库声明 Node 24。
- 主进程文件关联/媒体租约 19 项、播放列表/历史重选/字幕目录 9 项测试通过。
- 通过 FFmpeg 生成一秒 MP4/MOV/MKV/TS/M2TS/WebM 样片，以 BlobSource 与 CustomSource Range 两种输入运行现有 ALL_FORMATS 容器/视频轨/时长探测，共 12 组成功；结果见 evidence.json。未验证实际解码、画面、声音或 seek。
- TS/M2TS 样片 computeDuration 返回 2.6 秒（包含非零时间起点）；不将容器探测成功等同于完整播放通过。
- 系统文件关联需重新打包安装后生效，未做安装验证；未提交或发布。
- 格式依据：本地 mediabunny/src/input-format.ts 与 https://mediabunny.dev/guide/supported-formats-and-codecs 。OGG 当前只读音频，未纳入；HLS 多文件来源不在本轮范围。
