import type { PlaylistEntry } from '../platform'

/**
 * 播放列表展示用的分组结果。
 *
 * 字幕组 / 压制组文件名的公共前缀往往很长，单行截断后各集只剩相同的作品名。
 * 这里把相邻且共享足够前缀的条目合并为一组，组标题展示公共部分，条目只展示差异片段。
 * 只合并相邻条目、不重排，是因为上一集 / 下一集和自动连播都依赖列表原有的自然排序。
 */
export interface PlaylistDisplayItem {
  entry: PlaylistEntry
  /** 条目主文字：组内差异片段，未分组时为去扩展名的文件名 */
  label: string
}

export interface PlaylistDisplayGroup {
  /** 公共部分；单项组没有标题 */
  title?: string
  items: PlaylistDisplayItem[]
}

interface Word {
  start: number
  end: number
  text: string
}

interface ParsedName {
  base: string
  words: Word[]
  /** 开头方括号段（通常是字幕组名）的结束位置，没有时为 -1 */
  leadingBracketEnd: number
}

const WORD = /[^\s._\-[\]()【】]+/g
const OPENERS: Record<string, string> = { '[': ']', '(': ')', '【': '】' }
const CLOSERS: Record<string, string> = { ']': '[', ')': '(', '】': '【' }
const VIDEO_EXTENSION = /\.[a-z0-9]{2,5}$/i

/** 公共前缀的最小显示宽度（中日韩字符计 2），避免只因共享年份、短词就把不同作品并到一起 */
const MIN_PREFIX_WIDTH = 6

/** U+2E80 起为中日韩部首、汉字、假名及全角符号，按双宽计；用十进制避开 Prettier 与 ESLint 的十六进制大小写冲突 */
const WIDE_CHAR_START = 11_904

const displayWidth = (text: string) =>
  [...text].reduce((width, char) => width + (char.codePointAt(0)! >= WIDE_CHAR_START ? 2 : 1), 0)

const stripExtension = (name: string) => name.replace(VIDEO_EXTENSION, '') || name

const parseName = (name: string): ParsedName => {
  const base = stripExtension(name)
  const words = [...base.matchAll(WORD)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0].toLowerCase(),
  }))
  const opener = base[0]
  const leadingBracketEnd = opener && OPENERS[opener] ? base.indexOf(OPENERS[opener]) : -1
  return { base, words, leadingBracketEnd }
}

/**
 * 截取 [start, end) 后补齐被词边界切开的括号：
 * 片段里有未闭合的左括号时向右吞掉紧邻的右括号，有多余右括号时向左吞掉紧邻的左括号。
 */
const sliceBalanced = (base: string, start: number, end: number) => {
  let unclosed = 0
  let unopened = 0
  for (const char of base.slice(start, end)) {
    if (OPENERS[char]) unclosed++
    else if (CLOSERS[char]) {
      if (unclosed > 0) unclosed--
      else unopened++
    }
  }
  while (unclosed > 0 && end < base.length && CLOSERS[base[end]]) {
    end++
    unclosed--
  }
  while (unopened > 0 && start > 0 && OPENERS[base[start - 1]]) {
    start--
    unopened--
  }
  return base.slice(start, end)
}

const commonPrefixWords = (a: Word[], b: Word[], limit: number) => {
  let count = 0
  while (count < limit && count < a.length && count < b.length && a[count].text === b[count].text)
    count++
  return count
}

const prefixText = (name: ParsedName, count: number) =>
  count > 0 ? sliceBalanced(name.base, 0, name.words[count - 1].end) : ''

/** 公共前缀必须足够长，且不能只是开头的字幕组方括号段 */
const isUsablePrefix = (name: ParsedName, count: number) => {
  if (count === 0 || displayWidth(prefixText(name, count)) < MIN_PREFIX_WIDTH) return false
  return name.leadingBracketEnd < 0 || name.words[count - 1].end > name.leadingBracketEnd
}

const commonSuffixWords = (names: ParsedName[], prefix: number) => {
  // 每个条目至少保留一个差异词，否则后缀折叠会把整段差异吃掉
  const limit = Math.min(...names.map((name) => name.words.length - prefix - 1))
  let count = 0
  while (count < limit) {
    const text = names[0].words[names[0].words.length - 1 - count].text
    if (names.some((name) => name.words[name.words.length - 1 - count].text !== text)) break
    count++
  }
  return Math.max(count, 0)
}

const buildGroup = (entries: PlaylistEntry[], names: ParsedName[], prefix: number) => {
  if (entries.length < 2) {
    return { items: entries.map((entry, index) => ({ entry, label: names[index].base })) }
  }
  const suffix = commonSuffixWords(names, prefix)
  return {
    title: prefixText(names[0], prefix),
    items: entries.map((entry, index) => {
      const { base, words } = names[index]
      const last = words.length - suffix - 1
      // 差异为空（文件名恰好是公共前缀）时回退完整文件名
      const label =
        last >= prefix ? sliceBalanced(base, words[prefix].start, words[last].end) : base
      return { entry, label }
    }),
  }
}

export const groupPlaylistForDisplay = (
  entries: ReadonlyArray<PlaylistEntry>,
): PlaylistDisplayGroup[] => {
  const groups: PlaylistDisplayGroup[] = []
  let groupEntries: PlaylistEntry[] = []
  let groupNames: ParsedName[] = []
  let prefix = 0

  const flush = () => {
    if (groupEntries.length) groups.push(buildGroup(groupEntries, groupNames, prefix))
  }

  for (const entry of entries) {
    const name = parseName(entry.name)
    if (groupEntries.length) {
      const shared = commonPrefixWords(groupNames[0].words, name.words, prefix)
      if (isUsablePrefix(groupNames[0], shared)) {
        groupEntries.push(entry)
        groupNames.push(name)
        prefix = shared
        continue
      }
      flush()
    }
    groupEntries = [entry]
    groupNames = [name]
    prefix = name.words.length
  }
  flush()
  return groups
}
