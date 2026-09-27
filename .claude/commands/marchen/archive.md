---
name: "Marchen: Archive"
description: 归档已完成的变更
category: Workflow
tags: [workflow, archive]
---

归档已完成的变更，检查完成度后执行归档。

---

**输入**：用户的请求可包含变更名称（如 `/marchen:archive add-auth`），也可不带。

**自动验收配置**

进入流程及收尾前执行 `marchen config get acceptance.enabled --json`，根据 `value` 判断是否启用自动验收。命令失败时报告错误并停止，不自行读取配置兜底。关闭不代表验收通过，不免除正常检查，也不修改已有证据或人的决定。

**流程**

1. **确定变更名称**

   按以下优先级确定目标：
   - 用户显式指定名称：使用该名称。
   - 未指定名称但对话上下文唯一明确指向某个变更：直接使用，即使有多个 open 变更也不重复确认。
   - 上下文无法确定：运行 `marchen list --json`，只有一个 open 变更时自动使用。
   - 仍有多个合理候选：展示候选并询问，使用当前环境可用的原生询问工具或普通文本，不绑定特定工具；得到答案前不执行依赖目标的操作。

   没有 open 变更、显式名称或上下文目标不存在时，说明未找到目标，不擅自切换或创建变更。
   确定后显示："使用变更: `<name>`"。

2. **检查完成度**

   ```bash
   marchen status <name> --json
   marchen acceptance status <name> --json
   ```

   重新查询自动验收配置。解析 JSON，检查：
   - `artifacts`：每个 artifact 的 `status` 是否为 `filled`
   - `tasks.completed` vs `tasks.total`（`tasks` 为 null 时视为无任务，跳过检查）
   - 仅自动验收开启且本次不是 lite「直接归档」时检查签核：`acceptance exists` 为 false，或 `decision` 不是 accepted → 警告「尚未签核」

   **如果本次来自 lite「直接归档」：** 不要再问尚未验收，继续。

   **如果 artifact 和任务全部完成，且已 accepted、自动验收关闭或 lite 已声明跳过三者之一成立：** 直接进入下一步。先 `marchen acceptance stop <name>`。

   **如果有未完成的 artifact、task，或在需要检查签核时尚未签核：**
   - 显示警告，列出未完成项
   - 用 **AskUserQuestion** 确认是否继续
   - 用户确认后继续，不阻塞
   - 归档前尽量 `marchen acceptance stop <name>`

   自动验收关闭时，不因验收缺失或 pending/rejected 再次确认；已有状态可如实报告，证据和决定随目录归档，不改写为 accepted。任务或 artifact 未完成仍须按上述规则确认。

3. **生成摘要**

   读取 `marchen/changes/<name>/proposal.md`，从中生成一句话中文摘要（≤50字），概括这次变更做了什么。摘要应包含关键语义词，便于后续 AI 检索。

4. **执行归档**

   ```bash
   marchen archive <name> --summary "<生成的摘要>" --json
   ```

   解析返回的 JSON 获取归档结果。

5. **显示结果**

   ```
   变更 "<name>" 已归档
   Schema: <schema>
   归档到: <archivedTo>
   ```

   如有警告（未完成项），一并显示。

**护栏**

- 用 `status --json` 检查完成度，不要自己读文件判断
- 警告不阻塞归档，只提醒 + 确认
- 使用 AskUserQuestion 时，选项不超过 4 个
