import mimeTypes from './mime-utils-types'

export const fromFileExtension = (ext: string) => {
  ext = ext.toLowerCase()
  for (const t of mimeTypes) {
    if (t.e.includes(ext)) {
      return t.t
    }
  }
  return null
}

export const fromFilename = (name: string) => {
  if (!name) return null
  const splitted = name.trim().split('.')
  if (splitted.length <= 1) return null
  return fromFileExtension(splitted.at(-1) ?? '')
}

export const toFileExtension = (mimeType: string) => {
  mimeType = mimeType.toLowerCase()
  for (const t of mimeTypes) {
    if (mimeType === t.t) {
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let j = 0; j < t.e.length; j++) {
        if (t.e[j].length === 3) return t.e[j]
      }
      return t.e[0]
    }
  }
  return null
}

export const fromDataUrl = (dataUrl: string) => {
  const defaultMime = 'text/plain'
  const p = dataUrl.slice(0, Math.max(0, dataUrl.indexOf(','))).split(';')
  let s = p[0]
  const result = s.split(':')
  if (result.length <= 1) return defaultMime
  s = result[1]
  return s.includes('/') ? s : defaultMime
}
