/**
 * 文件哈希计算工具
 *
 * 使用 SparkMD5 计算文件前 16MB 内容的 MD5 哈希值。
 * 取前 16MB 而非全文件是为了在大文件场景下保持计算速度，
 * 同时仍能有效区分不同文件（用于弹幕匹配等场景）。
 *
 * 提供两个函数：
 * - calculateFileHash：接收 File 对象（renderer 进程 / Web 环境使用）
 * - calculateFileHashByBuffer：接收 Buffer（main 进程使用）
 */

import SparkMD5 from 'spark-md5'

/** 哈希计算使用的文件切片大小：16MB */
const HASH_SLICE_SIZE = 16 * 1024 * 1024

/**
 * 通过 File 对象计算文件哈希
 * 适用于 renderer 进程或 Web 环境，通过 Blob API 读取文件内容
 *
 * @param file - 要计算哈希的 File 对象
 * @returns 文件前 16MB 内容的 MD5 哈希值（小写）
 */
export const calculateFileHash = async (file: File): Promise<string> => {
  // 取前 16MB 切片
  const blob = file.slice(0, HASH_SLICE_SIZE)
  // 使用 Blob#arrayBuffer() 读取文件内容
  const arrayBuffer = await blob.arrayBuffer()
  // 使用 SparkMD5 计算 MD5
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(arrayBuffer)
  return spark.end().toLowerCase()
}

/**
 * 通过 Buffer 计算文件哈希
 * 适用于 main 进程，直接操作 Node.js Buffer
 *
 * @param buffer - 要计算哈希的 Buffer
 * @returns buffer 前 16MB 内容的 MD5 哈希值（小写），与 calculateFileHash 对相同内容产生相同结果
 */
export const calculateFileHashByBuffer = async (buffer: Buffer): Promise<string> => {
  // 使用 Buffer 的 subarray 方法取前 16MB
  const slice = buffer.subarray(0, HASH_SLICE_SIZE)
  // 使用 SparkMD5 计算 MD5
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(slice)
  return spark.end().toLowerCase()
}
