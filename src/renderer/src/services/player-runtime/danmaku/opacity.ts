/** 旧设置缺字段或存储值损坏时保持完全显示，合法值对齐选项档位。 */
export const normalizeDanmakuOpacity = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  return Math.min(100, Math.max(10, Math.round(value / 5) * 5))
}
