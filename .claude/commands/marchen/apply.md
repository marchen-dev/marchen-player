---
name: "Marchen: Apply"
description: 按变更的 tasks.md 逐个实现任务
category: Workflow
tags: [workflow, implementation]
---

按变更的 tasks.md 逐个实现任务，完成后勾选 checkbox。

---

**输入**：`/marchen:apply` 后面跟变更名称，或省略自动推断。

**流程**

1. **选择变更**

   有名称就用，没有则：
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择
   - 多个变更时 `marchen list --json` + **AskUserQuestion** 让用户选

   显示："使用变更: `<name>`"

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
   - `"blocked"` → 提示先完成 artifacts（`/marchen:propose`）
   - `"all_done"` → 提示归档（`/marchen:archive`）
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
   - 发现设计问题 → 建议更新 artifact
   - 遇到错误或阻塞 → 报告并等待
   - 用户中断

5. **显示结果**

   全部完成时：
   "全部完成 (N/N)，可以用 `/marchen:archive` 归档。"

   暂停时：
   "暂停于任务 N/M: <原因>"

**护栏**

- 实现前必须读 context 中的 artifact 内容
- 每完成一个任务立即勾选 checkbox，不要攒着
- 改动最小化，只做任务要求的事
- 不确定就暂停问，不要猜
- 使用 AskUserQuestion 时，选项不超过 4 个
- `instruction` 是给你的指引，不要原样复制到代码注释中
