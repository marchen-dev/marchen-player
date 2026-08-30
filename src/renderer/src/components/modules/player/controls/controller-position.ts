export interface PersistedControllerPosition {
  xRatio: number
  yRatio: number
}

export const DEFAULT_CONTROLLER_POSITION: PersistedControllerPosition = {
  xRatio: 0.5,
  yRatio: 0.72,
}

export const resolveControllerPosition = (
  value: PersistedControllerPosition | undefined,
): PersistedControllerPosition => value ?? DEFAULT_CONTROLLER_POSITION

/** 只更新桌面悬浮控制器字段，保留同一设置对象中的移动端和播放器选项。 */
export const withControllerPosition = <T extends object>(
  settings: T,
  position: PersistedControllerPosition,
): T & { controllerPosition: PersistedControllerPosition } => ({
  ...settings,
  controllerPosition: position,
})
