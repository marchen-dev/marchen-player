import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { savePath } from '@main/constants/app'

interface IdentityFile {
  installId: string
  createdAt: string
}

const isIdentityFile = (value: unknown): value is IdentityFile => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<IdentityFile>
  return typeof candidate.installId === 'string' && typeof candidate.createdAt === 'string'
}

export const createInstallIdentityStore = (filePath: string) => {
  let pending: Promise<string> | undefined

  const read = async (): Promise<string | undefined> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
      return isIdentityFile(parsed) ? parsed.installId : undefined
    } catch {
      return undefined
    }
  }

  const create = async (): Promise<string> => {
    const installId = randomUUID()
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(
      temporaryPath,
      JSON.stringify({ installId, createdAt: new Date().toISOString() } satisfies IdentityFile),
      { encoding: 'utf8', mode: 0o600 },
    )
    await rename(temporaryPath, filePath)
    return installId
  }

  return {
    getOrCreate(): Promise<string> {
      pending ??= read().then((existing) => existing ?? create())
      return pending
    },
    async reset(): Promise<void> {
      pending = undefined
      await rm(filePath, { force: true })
    },
  }
}

const identityPath = () => join(savePath(), 'telemetry', 'identity.json')
let appIdentityStore: ReturnType<typeof createInstallIdentityStore> | undefined

// 同一次 Electron 启动中的 Main 与 Renderer 共用该标识，避免跨运行时事件无法串联。
export const telemetryAppSessionId = randomUUID()

const getAppIdentityStore = () => {
  appIdentityStore ??= createInstallIdentityStore(identityPath())
  return appIdentityStore
}

export const getOrCreateTelemetryInstallId = (): Promise<string> =>
  getAppIdentityStore().getOrCreate()

export const resetTelemetryInstallId = async (): Promise<void> => {
  await getAppIdentityStore().reset()
  appIdentityStore = undefined
}
