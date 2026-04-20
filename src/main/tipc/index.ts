/**
 * IPC Router 入口
 *
 * 汇总所有 IPC group 并导出统一的 Router 类型。
 * - groups 数组用于 registerIpc 注册
 * - IpcRouter 类型用于 renderer 端 createClient 的泛型参数
 */

import type { MergeGroups } from '@marchen/electron-ipc/types'

import { appGroup } from './app'
import { playerGroup } from './player'
import { settingGroup } from './setting'
import { utilsGroup } from './utils'

/** 所有 IPC group 的数组，传给 registerIpc 进行批量注册 */
export const ipcGroups = [appGroup, playerGroup, settingGroup, utilsGroup]

/**
 * 合并所有 group 的类型，生成带命名空间的 Router 类型
 * renderer 端通过 createClient<IpcRouter> 获得完整的类型推导：
 *   ipcClient.app.windowAction(...)
 *   ipcClient.player.grabFrame(...)
 *   ipcClient.setting.setTheme(...)
 *   ipcClient.utils.getFilePathFromProtocolURL(...)
 */
export type IpcRouter = MergeGroups<
  [typeof appGroup, typeof playerGroup, typeof settingGroup, typeof utilsGroup]
>
