## 背景

将 Mediabunny 与官方 AC-3、DTS 扩展从 1.55.7 同步升级到 1.59.0，获取音频重采样、资源释放和 Matroska 时长等修复。保留精确版本锁定，不改播放器架构；验证现有接入的类型兼容性、回归测试及 Electron/Web 构建。

## 1. 依赖升级

- [x] 1.1 同步更新三个依赖及锁文件，检查差异范围

## 2. 验证

- [x] 2.1 执行播放器回归测试及 Electron/Web 构建（含类型检查与媒体资源准备），记录结果和未覆盖范围

## 验证记录

- 2026-09-23，Node 24.20.0、pnpm 11.24.0。
- `pnpm test:player-runtime`：37 个测试文件、173 项测试通过。
- `pnpm build`：媒体资源准备、node/web 类型检查、Electron 构建通过。
- `pnpm build:web`：媒体资源准备和 Web 构建通过。
- `git diff --check`：通过。依赖及锁文件差异仅涉及三个 Mediabunny 包。
- 构建有动态/静态导入混用和大 chunk 提示；未进行真实视频播放、音轨切换或长时间播放验收，未发布。
- 安装成功，但 prepare 阶段 simple-git-hooks 对 `.git/hooks/pre-commit` 执行 chmod 时返回 EPERM；未修改 hook 权限。
