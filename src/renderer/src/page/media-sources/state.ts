import type { BrowseView } from './view'
import { getStorageNS } from '@renderer/lib/ns'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export interface BrowseCrumb {
  ref: string
  title: string
}

/**
 * 每个来源上次浏览到的层级（面包屑路径）。ref 只是来源内的路径或 id，不含凭证，可以存在 localStorage；
 * 重置应用会随 localStorage 一起清掉。
 */
export const mediaSourceLocationsAtom = atomWithStorage<Record<string, BrowseCrumb[]>>(
  getStorageNS('media-source-locations'),
  {},
  undefined,
  { getOnInit: true },
)

/** 用户手动切换的网格 / 列表，只在本次运行内对「来源 + 层级」生效 */
export const browseViewOverridesAtom = atom<Record<string, BrowseView>>({})
