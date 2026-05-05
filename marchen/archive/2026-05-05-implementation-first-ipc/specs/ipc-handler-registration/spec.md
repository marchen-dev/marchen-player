### 需求: registerIpc SHALL 接收 router 对象并注册所有 handler 到 ipcMain

`registerIpc` 遍历 router 对象的两层结构（group → handler），为每个 handler 注册 `ipcMain.handle`，channel 格式为 `{groupName}:{methodName}`。

#### 场景: 注册 router 中所有 handler

WHEN 调用 `registerIpc(router)` 且 router 包含 `{ setting: { getWindowIsFullScreen: ..., setTheme: ... } }`
THEN `ipcMain.handle` 被调用注册 `"setting:getWindowIsFullScreen"` 和 `"setting:setTheme"` 两个 channel

#### 场景: handler 接收正确的 context 和 input

WHEN renderer 端调用 `ipcClient.setting.setTheme('dark')`
THEN 对应 handler 的 action 函数收到 `{ context: { sender: WebContents }, input: 'dark' }`

#### 场景: handler 返回值传递回 renderer

WHEN handler 的 action 函数返回 `Promise<boolean>`
THEN renderer 端的调用 `await ipcClient.setting.getWindowIsFullScreen()` 收到该 boolean 值
