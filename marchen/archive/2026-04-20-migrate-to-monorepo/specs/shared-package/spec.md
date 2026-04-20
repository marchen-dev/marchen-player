### 需求: 包 SHALL 导出协议常量 MARCHEN_PROTOCOL 和 MARCHEN_PROTOCOL_PREFIX

#### 场景: main 进程引用协议常量
WHEN `import { MARCHEN_PROTOCOL, MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'`
THEN MARCHEN_PROTOCOL 为 `'marchen'`，MARCHEN_PROTOCOL_PREFIX 为 `'marchen://'`

#### 场景: renderer 进程引用协议常量
WHEN renderer 代码 `import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'`
THEN 可正常导入，值与 main 进程一致

### 需求: 包 SHALL 导出文件哈希计算函数 calculateFileHash 和 calculateFileHashByBuffer

#### 场景: renderer 端通过 File 对象计算哈希
WHEN 调用 `calculateFileHash(file)` 传入 File 对象
THEN 返回文件前 16MB 内容的 MD5 哈希（小写）

#### 场景: main 端通过 Buffer 计算哈希
WHEN 调用 `calculateFileHashByBuffer(buffer)` 传入 Buffer
THEN 返回 buffer 前 16MB 内容的 MD5 哈希（小写），与 calculateFileHash 对相同内容产生相同结果

### 需求: 包 SHALL 导出 RendererHandlers 接口类型

#### 场景: main 端使用 RendererHandlers 创建事件发射器
WHEN `import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'`
THEN 类型包含 showSetting、importAnime、getReleaseNotes、updateProgress、windowAction 五个事件定义

#### 场景: renderer 端使用 RendererHandlers 创建事件监听器
WHEN renderer 代码导入 RendererHandlers 类型
THEN 可用于 createListener 的泛型参数，提供类型安全的事件监听

### 需求: 包 SHALL 零依赖于 electron，可同时在 main 和 renderer 环境使用

#### 场景: 包的 package.json 不包含 electron 相关依赖
WHEN 检查 @marchen/shared 的 package.json
THEN dependencies 和 peerDependencies 中不包含 electron
