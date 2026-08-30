export const isVideoFile = (filePath: string): boolean => {
  const extension = filePath.split('.').pop()?.toLowerCase()
  return extension === 'mp4' || extension === 'mkv'
}
