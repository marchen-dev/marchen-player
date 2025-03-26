import { isLinux } from '@main/lib/env'
import { app } from 'electron'

export const enableHardwareDecodingOnLinux = () => {
  if (!isLinux) return

  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch(
    'enable-features',
    'VaapiVideoDecoder,VaapiIgnoreDriverChecks,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
  )
}
