/** 媒体协议只依赖可用性 Port，避免将下载子进程依赖带进协议与测试。 */
let check: (path: string) => Promise<boolean> = async () => true
export const setDownloadAvailability = (reader: typeof check) => {
  check = reader
}
export const isDownloadedMediaAvailable = (path: string) => check(path)
