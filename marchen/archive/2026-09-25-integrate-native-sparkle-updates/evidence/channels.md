# 自动三渠道本地验证

2026-09-23，当前版本已设为 1.0.0-alpha.0。此次未提交、未推送、未创建远端分支、未配置生产 secrets、未公开发行。

## 实现

- shared/update-policy.ts：严格稳定版/alpha.N/beta.N 解析与排序、渠道包含关系、固定更新地址、Mac 构建版本可逆映射。
- Windows：从 app.getVersion() 选择 generic 渠道源，设置渠道后显式 allowDowngrade=false；未知版本停止更新。现有 UI、下载/安装保存屏障保持。
- Mac：打包根据版本写入对应固定 feed；显示 SemVer、内部构建版本使用 a/b 后缀。无新增自定义版本比较器或 Sparkle 补丁。
- 构建产出 Draft；公开 Release 后由独立 workflow 筛选并重建 update-feeds 分支。所有输入先验证，通过一次 Git ref 更新公开，重复相同内容不提交，已有渠道不允许回退。
- 各渠道选择允许范围内最高版本。安装包 URL 固定到版本，不依赖 GitHub Latest。Alpha/Beta 不设 Latest；跨渠道晋升使用全量包，同渠道可生成官方直接差分。
- Windows 元数据文件名随版本自动选 latest/beta/alpha.yml；Mac 生成器显式指定 appcast 输出，校验实际文件存在。

## 已执行检查

- 类型检查通过。
- 主进程/发行工具测试：20 文件、87 项通过，覆盖三渠道矩阵、晋升、低版本晚发布、Draft/未知渠道、双平台资产缺失、坏元数据、重复生成、源回退保护。
- 播放器回归：37 文件、184 项通过。
- 相关 ESLint、git diff --check 通过。
- Electron 和 Web 构建通过；两份 workflow 的 YAML 解析及 shell 语法检查通过。
- 官方 Sparkle 2.10.0 比较器实测：直接使用 1.0.0-alpha.N 比较失败；改为 1.0.0a(N+1)/b(N+1) 后 100 个双向排序组合通过。测试脚本已加入 Mac CI。
- 真实构建 Alpha ARM64 ZIP、DMG 和 Windows x64 NSIS、blockmap、alpha.yml。
- Mac 应用 codesign deep/strict、架构、原生资源/许可证、媒体资源、无敏感构建文件检查通过；读取 Info.plist 确认 CFBundleVersion=1.0.0a1、CFBundleShortVersionString=1.0.0-alpha.0、SUFeedURL 以 mac/alpha.xml 结尾。
- 用隔离测试密钥对真实 ZIP 生成并验证 appcast；最终汇总实际 DMG/ZIP/NSIS/YAML/appcast 运行 verify-assets 通过，含 Windows 完整安装包 SHA512。
- 以实际产物模拟公开 Alpha Release（仅本地 fixture）生成渠道源，结果 stable=null、beta=null、alpha=1.0.0-alpha.0；不会向稳定版/Beta 提供 Alpha。

## 边界

用户已反馈之前的 Windows 安装运行无问题，本轮新增渠道包未声称已在 Windows 实机完成 A→B 安装。未执行 GitHub API 写入或远端 Actions；原生安装完整回归、Gatekeeper 首次下载、真实播放器进度恢复及原任务 6.2～6.4 仍未勾选。因为原变更尚未全部完成，本轮不代替最终 acceptance 签核。

本地 `.tmp/channel-build2` 使用测试公钥，仅用于验证，不能作为正式发行资产上传。公开首版前仍需正式密钥、最终包验收和人工公开 Draft。
