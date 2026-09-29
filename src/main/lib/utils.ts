export { isVideoFile } from './file-open'

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const parseReleaseNotes = (releaseNotes: string | unknown[] | null | undefined) => {
  let releaseContent = ''

  if (releaseNotes) {
    if (typeof releaseNotes === 'string') {
      releaseContent = releaseNotes
    } else if (Array.isArray(releaseNotes)) {
      releaseNotes.forEach((releaseNote) => {
        releaseContent += `${releaseNote}\n`
      })
    }
  } else {
    releaseContent = '暂无更新说明'
  }

  return releaseContent
}
