/**
 * IPC Handler 类型契约（contract-first）
 *
 * 这是所有 IPC 方法签名的唯一定义处。
 * 通过 module augmentation 扩展 @marchen/electron-ipc 的 IpcHandlerMap，
 * defineGroup 会自动约束实现必须匹配这里的签名。
 *
 * 新增/修改 handler 时只需改这个文件，main 端实现会自动获得类型约束。
 */

export type AppTheme = 'light' | 'dark' | 'system'

declare module '@marchen/electron-ipc/types' {
  interface IpcHandlerMap {
    app: {
      windowAction: (input: {
        action:
          | 'close'
          | 'minimize'
          | 'maximum'
          | 'restart'
          | 'reset'
          | 'laungh-at-login'
          | 'enter-full-screen'
          | 'leave-full-screen'
          | 'switch-full-screen'
          | 'hidden-title-bar'
          | 'show-title-bar'
        checked?: boolean
      }) => Promise<void>
      checkUpdate: () => Promise<
        string | { response: number; checkboxChecked: boolean }
      >
      installUpdate: () => Promise<void>
      confirmationDialog: (input: { title: string }) => Promise<boolean>
      addRecentDocument: (input: { path: string }) => Promise<void>
    }
    player: {
      showWarningDialog: (input: {
        title: string
        content: string
      }) => Promise<number>
      getAnimeDetailByPath: (input: { path: string }) => Promise<
        | {
            ok: number
            message: string
            fileSize?: undefined
            fileName?: undefined
            fileHash?: undefined
            filePath?: undefined
          }
        | {
            ok: number
            fileSize: number
            fileName: string
            fileHash: string
            filePath: string
            message?: undefined
          }
      >
      grabFrame: (input: { path: string; time: string }) => Promise<string>
      importAnime: () => Promise<string | undefined>
      getAnimeInSamePath: (input: {
        path: string
      }) => Promise<Array<{ urlWithPrefix: string; name: string }>>
      importSubtitle: () => Promise<
        { fileName: string; filePath: string } | undefined
      >
      getSubtitlesIntroFromAnime: (input: {
        path: string
      }) => Promise<
        Array<{
          index: number
          tags: { language: string; title: string }
          [key: string]: any
        }>
      >
      getSubtitlesBody: (input: {
        path: string
        index: number
      }) => Promise<
        | { ok: number; data: string; message?: undefined }
        | { ok: number; message: string; data?: undefined }
      >
      matchSubtitleFile: (input: {
        path: string
      }) => Promise<Array<{ fileName: string; filePath: string }> | undefined>
      immportDanmakuFile: () => Promise<
        | undefined
        | { ok: number; message: string; data?: undefined }
        | {
            ok: number
            data: {
              danmaku: Array<{ cid: number; m: string; p: string }>
              source: string
            }
            message?: undefined
          }
      >
    }
    setting: {
      getWindowIsFullScreen: () => Promise<boolean | undefined>
      setTheme: (input: AppTheme) => Promise<void>
    }
    utils: {
      getFilePathFromProtocolURL: (input: {
        path: string
      }) => Promise<string>
      coverSubtitleToAss: (input: {
        path: string
      }) => Promise<{ fileName: string; filePath: string } | undefined>
    }
  }
}

/** renderer 端的 IPC 调用类型，直接等于 IpcHandlerMap */
export type { IpcHandlerMap as IpcRouter } from '@marchen/electron-ipc/types'
