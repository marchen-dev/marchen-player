import { isLinux } from '@main/lib/env'
import { app } from 'electron'

/**
 * 在 Linux 系统上尝试启用硬件解码 (第三版尝试 - 聚焦 X11 + 关键特性)
 * 注意：这些标志需要在 app 'ready' 事件触发之前应用。
 */
export const enableHardwareDecodingOnLinux = () => {
  if (!isLinux) return

  // --- 关键标志 ---

  // 1. 不再强制 Wayland，允许默认使用 X11 (或使用 hint)
  //    因为 Wayland 导致了 GPU 进程无法启动。
  // app.commandLine.appendSwitch('ozone-platform', 'x11'); // 可以明确指定 x11
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto') // 或者让其自动选择（通常是 x11）
  // **注意**: 移除了 app.commandLine.appendSwitch('ozone-platform', 'wayland');

  // 2. 恢复设置渲染后端为 ANGLE on Vulkan
  //    因为这在 X11 环境下之前是能成功初始化 GPU 进程的。
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'vulkan') // <--- 恢复为 vulkan

  // 3. 启用特性 (Features) - 加入 UseMultiPlaneFormatForHardwareVideo
  const features = [
    'VaapiVideoDecoder', // 启用 VA-API 解码器
    'UseMultiPlaneFormatForHardwareVideo', // **重要**: 加入此特性，尝试修复帧池问题
    'VaapiIgnoreDriverChecks', // 忽略驱动兼容性检查
    'Vulkan', // 启用 Vulkan
    'VulkanFromANGLE', // 允许 ANGLE 使用 Vulkan
    'DefaultANGLEVulkan', // 默认 ANGLE 后端为 Vulkan
    'CanvasOopRasterization',
  ]
  const featuresString = features.join(',')
  app.commandLine.appendSwitch('enable-features', featuresString)
}
