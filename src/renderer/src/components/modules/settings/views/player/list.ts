import type { SelectGroup } from '@renderer/components/modules/shared/setting/SettingSelect'

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
] satisfies SelectGroup[]

export const danmakuDurationList = [
  {
    label: '极慢',
    value: '17000',
  },
  {
    label: '较慢',
    value: '19000',
  },
  {
    label: '适中',
    value: '15000',
    default: true,
  },
  {
    label: '较快',
    value: '13000',
  },
  {
    label: '极快',
    value: '10000',
  },
] satisfies SelectGroup[]

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
] satisfies SelectGroup[]
