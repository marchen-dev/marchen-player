import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const arguments_ = process.argv.slice(2)
const valueOf = (flag) => {
  const index = arguments_.indexOf(flag)
  return index >= 0 ? arguments_[index + 1] : undefined
}
const has = (flag) => arguments_.includes(flag)

const root = resolve(valueOf('--root') ?? '')
const target = valueOf('--target')
const expectedRelease = valueOf('--expected-release')
const expectedDist = valueOf('--expected-dist')
const requireNoMaps = has('--require-no-maps')

const files = []
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(path)
  }
}

try {
  if (!(await stat(root)).isDirectory()) throw new Error(`build root is not a directory: ${root}`)
  await walk(root)
  if (files.length === 0) throw new Error(`build root is empty: ${root}`)

  const maps = files.filter((file) => file.endsWith('.map'))
  if (requireNoMaps && maps.length > 0) {
    throw new Error(`Source Map files remain in distributable output (${maps.length})`)
  }

  const textFiles = files.filter((file) =>
    ['.js', '.mjs', '.cjs', '.html', '.json', '.css'].includes(extname(file)),
  )
  const contents = await Promise.all(textFiles.map((file) => readFile(file, 'utf8')))
  const joined = contents.join('\n')
  const authToken = process.env.SENTRY_AUTH_TOKEN
  if (authToken && joined.includes(authToken)) {
    throw new Error('SENTRY_AUTH_TOKEN value leaked into distributable output')
  }
  if (joined.includes('SENTRY_AUTH_TOKEN')) {
    throw new Error('SENTRY_AUTH_TOKEN identifier leaked into distributable output')
  }
  if (expectedRelease && !joined.includes(expectedRelease)) {
    throw new Error(`expected release metadata is missing: ${expectedRelease}`)
  }
  if (expectedDist && !joined.includes(expectedDist)) {
    throw new Error(`expected dist metadata is missing: ${expectedDist}`)
  }
  if (
    target === 'web' &&
    /@sentry\/electron|sentry-electron|electron\/(?:main|renderer)/i.test(joined)
  ) {
    throw new Error('Web bundle unexpectedly contains Electron Sentry SDK code')
  }

  console.log(
    `[observability] verified ${files.length} files: target=${target ?? 'electron'} release=${expectedRelease ?? 'unchecked'} dist=${expectedDist ?? 'unchecked'}`,
  )
} catch (error) {
  console.error(
    `[observability] verification failed: ${error instanceof Error ? error.message : error}`,
  )
  process.exitCode = 1
}
