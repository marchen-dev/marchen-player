import SparkMD5 from 'spark-md5'

export const calculateFileHash = async (file: File): Promise<string> => {
  // 取前16MB
  const blob = file.slice(0, 16 * 1024 * 1024)
  // 使用 Blob#arrayBuffer() 读取文件内容
  const arrayBuffer = await blob.arrayBuffer()
  // 使用 SparkMD5 计算 MD5
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(arrayBuffer)
  const hash = spark.end().toLowerCase() // 转换成小写
  return hash
}

export const calculateFileHashByBuffer = async (buffer: Buffer): Promise<string> => {
  // 使用 Buffer 的 subarray 方法取前16MB
  const slice = buffer.subarray(0, 16 * 1024 * 1024)
  // 使用 SparkMD5 计算 MD5
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(slice)
  const hash = spark.end().toLowerCase() // 转换成小写
  return hash
}
