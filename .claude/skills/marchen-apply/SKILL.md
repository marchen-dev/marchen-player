---
name: marchen-apply
description: 按变更的 tasks.md 逐个实现任务。适用于用户想按任务清单逐步实现代码。
---

按变更的 tasks.md 逐个实现任务，完成后勾选 checkbox。

---

**输入**：用户的请求应包含变更名称，或可从上下文推断。

**自动验收配置**

进入流程及收尾前执行 `marchen config get acceptance.enabled --json`，根据 `value` 判断是否启用自动验收。命令失败时报告错误并停止，不自行读取配置兜底。关闭不代表验收通过，不免除正常检查，也不修改已有证据或人的决定。

**流程**

1. **选择变更**

   按以下优先级确定目标：
   - 用户显式指定名称：使用该名称。
   - 未指定名称但对话上下文唯一明确指向某个变更：直接使用，即使有多个 open 变更也不重复确认。
   - 上下文无法确定：运行 `marchen list --json`，只有一个 open 变更时自动使用。
   - 仍有多个合理候选：展示候选并询问，使用当前环境可用的原生询问工具或普通文本，不绑定特定工具；得到答案前不执行依赖目标的操作。

   没有 open 变更、显式名称或上下文目标不存在时，说明未找到目标，不擅自切换或创建变更。
   确定后显示："使用变更: `<name>`"。

2. **获取实现指令**

   ```bash
   marchen instructions <name> apply --json
   ```

   返回 JSON 包含：
   - `state`：`"ready"` / `"blocked"` / `"all_done"`
   - `progress`：`{ total, completed, remaining }`
   - `context`：所有 artifact 的信息数组，每项包含 `id`、`status`、`path`、`content`
   - `instruction`：实现指引
   - `changeDir`：变更目录绝对路径

   根据 `state` 处理：
   - `"blocked"` → 提示先完成 artifacts
   - `"all_done"` → 先查询自动验收配置。关闭时报告任务完成和正常检查结果，提示可归档，不自动归档；已有 pending/rejected/accepted 状态仅如实报告，不因历史 rejected 自动返工或开新轮，不将关闭说成验收通过，然后结束。开启时先 `marchen acceptance status <name> --json`：已 accepted 则提示归档且不要开新轮；rejected 则按待修改项修改后开新一轮 acceptance；尚无验收则走第 5 步的验收收尾
   - `"ready"` → 继续

3. **显示进度**

   从返回的 JSON 读取并显示：
   "变更: `<name>` | 进度: N/M | 下一个: <第一个未完成任务的描述>"

4. **逐个实现任务**

   从 `context` 中读取所有 artifact 内容作为上下文。

   对每个未完成任务：
   - 显示 "任务 N/M: <描述>"
   - 实现代码改动
   - 在 tasks.md 中勾选：`- [ ]` → `- [x]`
     文件路径：`<changeDir>/tasks.md`
   - 显示 "✓ 完成"
   - 继续下一个

   **暂停条件：**
   - 任务不清晰 → 询问用户
   - 发现设计问题 → 建议用 `/marchen:update` 修订计划
   - 遇到错误或阻塞 → 报告并等待
   - 用户中断

5. **显示结果**

   全部完成时（任务从「未全部完成」变为「全部完成」的这一次）：
   先重新查询自动验收配置。关闭时报告实现和正常检查结果，提示 `/marchen:archive <name>`，然后结束；不创建验收证据、不启动服务、不轮询、不自动归档。
   开启时 MUST 接着执行 `marchen-acceptance` 的流程（预检、写 `rounds/1`、`render`、`serve`、轮询决定）。不要只打印一句提示就结束。
   禁止代人点验收页上的接受、打回修改或「让 AI 修改」。

   人接受后询问是否归档；提交待修改则按 `decision.items` 继续改，修完开新轮。

   暂停时：
   "暂停于任务 N/M: <原因>"

**护栏**

- 实现前必须读 context 中的 artifact 内容
- 每完成一个任务立即勾选 checkbox，不要攒着
- 改动最小化，只做任务要求的事
- 不确定就暂停问，不要猜
- 如果实现过程中遇到不确定的设计决策，先扫描 `marchen/changelog.md`，再读取相关 archive 中的 proposal、design 或 spec
- `instruction` 是给你的指引，不要原样复制到代码注释中
