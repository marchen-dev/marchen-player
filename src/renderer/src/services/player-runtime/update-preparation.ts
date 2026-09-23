/** 当前播放会话注册自己的保存动作；更新协调器不直接拼写历史记录。 */
let prepare: (() => Promise<void>) | undefined
export const registerUpdatePreparation = (handler: () => Promise<void>) => {
  prepare = handler
  return () => {
    if (prepare === handler) prepare = undefined
  }
}
export const preparePlayerUpdate = async () => {
  await prepare?.()
}
