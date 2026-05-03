/**
 * IPC Router 入口
 *
 * 汇总所有 IPC group 并导出统一的 Router 类型。
 * - groups 数组用于 registerIpc 注册
 * - 双向类型校验确保实现与 @marchen/shared 中的接口一致
 */

import type { MergeGroups } from '@marchen/electron-ipc/types'
import type { IpcRouter } from '@marchen/shared/types/ipc-router'

import { appGroup } from './app'
import { playerGroup } from './player'
import { settingGroup } from './setting'
import { utilsGroup } from './utils'

/** 所有 IPC group 的数组，传给 registerIpc 进行批量注册 */
export const ipcGroups = [appGroup, playerGroup, settingGroup, utilsGroup]

/** 从 group 实现推导出的 Router 类型 */
type IpcRouterImpl = MergeGroups<
  [typeof appGroup, typeof playerGroup, typeof settingGroup, typeof utilsGroup]
>

// 双向类型校验：确保实现与接口完全匹配
// 如果新增/修改 handler 但未同步更新 @marchen/shared/types/ipc-router.ts，这里会报错
const _implSatisfiesContract: IpcRouter = {} as IpcRouterImpl
const _contractSatisfiesImpl: IpcRouterImpl = {} as IpcRouter
void _implSatisfiesContract
void _contractSatisfiesImpl
