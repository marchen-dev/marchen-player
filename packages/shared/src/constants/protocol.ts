/**
 * Marchen 自定义协议常量
 *
 * 用于 Electron 的 protocol.handle 注册自定义协议，
 * 使应用可以通过 marchen:// 前缀访问本地文件资源（如视频、字幕等）
 */

/** 协议名称，用于 protocol.handle 注册 */
export const MARCHEN_PROTOCOL = 'marchen'

/** 协议前缀，用于拼接完整的协议 URL（如 marchen://path/to/file） */
export const MARCHEN_PROTOCOL_PREFIX = `${MARCHEN_PROTOCOL}://`
