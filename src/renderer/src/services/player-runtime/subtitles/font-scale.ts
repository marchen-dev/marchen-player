/** 缩放只作用于内存副本；始终从原始字号计算，避免反复拖动累积误差。 */
export const normalizeSubtitleScale = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(200, Math.max(50, value)) / 5) * 5
    : 100

export const scaleAssFontSize = (content: string, percentage: number): string => {
  const factor = normalizeSubtitleScale(percentage) / 100
  if (factor === 1) return content
  const scale = (value: string) => String(Number((Number(value) * factor).toFixed(4)))
  let section = ''
  let fontSizeIndex = -1
  return content
    .split(/(\r?\n)/)
    .map((line) => {
      if (/^\s*\[.*\]\s*$/.test(line)) {
        section = line.trim().toLowerCase()
        fontSizeIndex = -1
      }
      if (section === '[v4+ styles]' || section === '[v4 styles]') {
        if (/^Format:/i.test(line)) {
          fontSizeIndex = line
            .slice(line.indexOf(':') + 1)
            .split(',')
            .findIndex((field) => field.trim().toLowerCase() === 'fontsize')
        } else if (/^Style:/i.test(line) && fontSizeIndex >= 0) {
          const fields = line.slice(line.indexOf(':') + 1).split(',')
          const size = fields[fontSizeIndex]
          if (size?.trim() && Number.isFinite(Number(size))) {
            fields[fontSizeIndex] = scale(size)
            return `${line.slice(0, line.indexOf(':') + 1)}${fields.join(',')}`
          }
        }
      }
      // 仅处理台词覆盖块中的字号，包含动画内的字号；不碰坐标、矢量绘图与普通文本。
      if (section === '[events]' && /^Dialogue:/i.test(line)) {
        return line.replace(/\{[^}]*\}/g, (block) =>
          block.replace(/\\fs([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g, (_match, size: string) => {
            // 带符号的 fs 是相对字号指令，保留其相对语义。
            if (/^[+-]/.test(size)) return `\\fs${size}`
            return `\\fs${scale(size)}`
          }),
        )
      }
      return line
    })
    .join('')
}
