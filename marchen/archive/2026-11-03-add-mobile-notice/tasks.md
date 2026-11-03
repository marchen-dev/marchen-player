## 背景

产品范围只覆盖 Electron 与 Web 桌面端，但偶尔会有手机用户访问网页版，看到的是未适配的桌面布局；右下角的 `DesktopPromo` 在手机上会溢出屏幕，而且推荐的桌面客户端手机装不了。

方案：

- 在 `lib/utils.ts` 新增启动时计算一次的 `isPhone`：UA 判定为手机（`navigator.userAgentData.mobile` 或 `/iPhone|iPod|Android.*Mobile/`）且物理屏幕短边 `< 600px`。平板（Android 平板 UA 不含 Mobile、iPadOS 伪装 Mac）与桌面窄窗口不算。
- 新增居中弹窗 `MobileNotice`：说明网页版为电脑设计，提供「分享链接」（`navigator.share`，不可用时退回复制到剪贴板）和「仍要继续」；点「仍要继续」后写 localStorage 不再出现，只分享不算看过。弹窗按窄屏布局。
- `App.tsx` 中手机只渲染 `MobileNotice`，不渲染 `DesktopPromo`；平板与桌面保持现状。
- 不新增埋点（手机访问量可用 PostHog 自带 `$device_type` 查询）。

## 1. 移动端检测

- [x] 1.1 在 `src/renderer/src/lib/utils.ts` 新增 `isPhone` 常量（UA + 屏幕短边，仅 Web 有意义）

## 2. 提示弹窗

- [x] 2.1 新增 `components/modules/app/MobileNotice.tsx`：窄屏居中弹窗，含说明、分享 / 复制链接、仍要继续，localStorage 记住已继续
- [x] 2.2 `App.tsx` 中手机渲染 `MobileNotice` 并不渲染 `DesktopPromo`

## 3. 校验

- [x] 3.1 typecheck 与 lint 通过
- [x] 3.2 用 Chrome DevTools 模拟手机与桌面，确认弹窗出现 / 不出现及互斥符合预期
