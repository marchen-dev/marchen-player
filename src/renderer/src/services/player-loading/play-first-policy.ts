/**
 * 优先播放偏好读取器（无依赖叶子模块）
 *
 * 设置 atom 所在模块经 lib/ns → toast → player-loading 间接依赖加载服务，
 * 加载服务若静态引用设置 atom 会形成循环导入并在启动时触发 TDZ。
 * 因此由设置模块在自身求值时注册读取器，加载服务只依赖本模块。
 */

let reader: () => boolean = () => false

export function setPlayFirstReader(next: () => boolean): void {
  reader = next
}

/** 每次加载开始时调用，读取最新偏好 */
export function readPlayFirst(): boolean {
  return reader()
}
