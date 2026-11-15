import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'

export const danmakuFontSizeList = [
  {
    label: '80%',
    value: '22',
  },
  {
    label: '90%',
    value: '24',
  },
  {
    label: '100%',
    value: '26',
    default: true,
  },
  {
    label: '110%',
    value: '28',
  },
  {
    label: '120%',
    value: '30',
  },
  {
    label: '130%',
    value: '32',
  },
  {
    label: '140%',
    value: '34',
  },
  // 2K / 4K 外接显示器上 140% 仍偏小，补充到 200%。
  // 已有档位的取值已被用户持久化，保持不动；新增档位按 26px 基准的实际倍数取整。
  ...[150, 160, 170, 180, 190, 200].map((percent) => ({
    label: `${percent}%`,
    value: String(Math.round((26 * percent) / 100)),
  })),
] satisfies SelectOption[]

/**
 * 持续时间与在屏密度的选项名是文字而不是数值，这里只存 id：
 * 这是模块顶层的常量，存了文字就不会随语言切换更新。
 * 名称在渲染时取 danmaku 命名空间的 `settings.durationOptions.<id>` / `settings.densityOptions.<id>`。
 */
export const danmakuDurationList = [
  { id: 'verySlow', value: '17000' },
  { id: 'slow', value: '19000' },
  { id: 'normal', value: '15000', default: true },
  { id: 'fast', value: '13000' },
  { id: 'veryFast', value: '10000' },
] as const

export const danmakuEndAreaList = [
  {
    label: '10%',
    value: '0.1',
  },
  {
    label: '25%',
    value: '0.25',
    default: true,
  },
  {
    label: '50%',
    value: '0.5',
  },
  {
    label: '75%',
    value: '0.75',
  },
  {
    label: '100%',
    value: '1',
  },
] satisfies SelectOption[]

export const danmakuDensityList = [
  { id: 'low', value: '40' },
  { id: 'medium', value: '80', default: true },
  { id: 'high', value: '120' },
] as const

// 与其余弹幕设置共用下拉样式，选回 100% 即恢复默认。
export const danmakuOpacityList: SelectOption[] = Array.from({ length: 19 }, (_, index) => {
  const value = 100 - index * 5
  return {
    label: `${value}%`,
    value: String(value),
    default: value === 100,
  }
})
