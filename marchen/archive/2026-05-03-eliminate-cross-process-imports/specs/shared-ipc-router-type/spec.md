### 需求: IpcRouter 接口 SHALL 完整描述所有 IPC group 的调用签名

`@marchen/shared` 中的 `IpcRouter` 接口必须包含所有 4 个 group（app、player、setting、utils）的方法签名，且每个方法的输入/输出类型与 main 端实现一致。

#### 场景: renderer 端通过 shared 包获取 IpcRouter 类型

WHEN renderer 端 `import type { IpcRouter } from '@marchen/shared/types/ipc-router'`
THEN TypeScript 编译成功，且 `createClient<IpcRouter>` 提供与当前相同的类型推导

#### 场景: IpcRouter 接口覆盖所有现有方法

WHEN 对比 IpcRouter 接口与 main 端 group 定义
THEN 接口包含以下 group 和方法：
- `app`: windowAction, checkUpdate, installUpdate, confirmationDialog, addRecentDocument
- `player`: showWarningDialog, getAnimeDetailByPath, grabFrame, importAnime, getAnimeInSamePath, importSubtitle, getSubtitlesIntroFromAnime, getSubtitlesBody, matchSubtitleFile, immportDanmakuFile
- `setting`: getWindowIsFullScreen, setTheme
- `utils`: getFilePathFromProtocolURL, coverSubtitleToAss

### 需求: IpcRouter 接口 SHALL 不依赖任何 main 进程代码

接口文件只能使用基础 TypeScript 类型，不能 import 任何来自 `src/main/`、`electron` 或其他 main 进程专属模块的内容。

#### 场景: shared 包独立编译

WHEN 单独对 `packages/shared/` 运行 TypeScript 类型检查
THEN 编译成功，不需要 `src/main/` 中的任何文件

### 需求: @marchen/shared 的 package.json exports SHALL 包含 ipc-router 路径

#### 场景: 通过包路径导入 IpcRouter

WHEN 使用 `import type { IpcRouter } from '@marchen/shared/types/ipc-router'`
THEN 模块解析成功，指向 `packages/shared/src/types/ipc-router.ts`
