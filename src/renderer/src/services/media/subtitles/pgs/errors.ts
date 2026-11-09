/**
 * PGS 解码的稳定原因码。只描述数据本身的问题，读取、取消等 I/O 错误由调用方另行分类；
 * 遥测按这些码聚合，因此新增或改名时要同步 `services/telemetry` 中的映射。
 */
export type PgsErrorCode =
  /** 段头或段长度越界、段内字段不完整 */
  | 'segment_invalid'
  /** 显示集缺少合成段（PCS）或结束段 */
  | 'composition_missing'
  /** 对象定义分片缺少首片 / 末片，或数据长度与声明不符 */
  | 'object_incomplete'
  /** 引用的对象、调色板在 epoch 内找不到 */
  | 'dependency_missing'
  /** RLE 数据越界、行溢出或行数不足 */
  | 'rle_invalid'
  /** 对象尺寸超过防御性上限 */
  | 'object_too_large'

export class PgsError extends Error {
  readonly code: PgsErrorCode

  constructor(code: PgsErrorCode, message: string) {
    super(message)
    this.name = 'PgsError'
    this.code = code
  }
}
