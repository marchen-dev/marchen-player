/**
 * IPC Router 入口
 *
 * 汇总所有 IPC group，用于 registerIpc 批量注册。
 * 类型约束由 defineGroup 的泛型自动保证（contract-first）。
 */

import { appGroup } from './app'
import { playerGroup } from './player'
import { settingGroup } from './setting'
import { utilsGroup } from './utils'

/** 所有 IPC group 的数组，传给 registerIpc 进行批量注册 */
export const ipcGroups = [appGroup, playerGroup, settingGroup, utilsGroup]
