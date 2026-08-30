# FFmpeg Electron 运行时

`runtime-manifest.json` 是构建和运行时自检的唯一版本来源。清单固定：

- FFmpeg 对应源码及 SHA-256；
- macOS x64/arm64、Windows x64 的不可变下载地址和归档 SHA-256；
- 上游构建脚本、构建配置和公开能力清单；
- Marchen 实际依赖的 decoder、encoder、demuxer、muxer、filter 与 protocol。

macOS 使用 Martin Riedl 的 9.0.1 GPL release build，Windows 使用 BtbN 固定日期与提交的
9.0.1 GPL static build。清单不包含 Linux 目标，也不得使用供应方的 `latest` 重定向。

供应方公开的 “full” 或 “GPL” 名称不能代替项目自检。资源准备后仍需要执行
`ffmpeg -version/-buildconf/-decoders/-encoders/-muxers/-filters/-protocols`，并保存实际输出；
硬件 encoder 出现在列表中也不代表当前设备能够成功初始化。

准备当前平台资源：

```bash
pnpm ffmpeg:prepare
```

为指定目标准备资源：

```bash
pnpm ffmpeg:prepare -- --target=darwin-x64
pnpm ffmpeg:prepare -- --target=darwin-arm64
pnpm ffmpeg:prepare -- --target=win32-x64
```

脚本先下载到系统临时目录，逐个校验完整 SHA-256，再解压并原子替换
`resources/ffmpeg/<platform>-<arch>`。校验或解压失败不会覆盖上一次可用资源。
