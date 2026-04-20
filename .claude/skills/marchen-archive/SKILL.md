---
name: marchen-archive
description: 归档已完成的变更。检查完成度后执行归档，适用于实现完毕后收尾。
---

归档已完成的变更，检查完成度后执行归档。

---

**输入**：用户的请求可包含变更名称（如 `/marchen:archive add-auth`），也可不带。

**流程**

1. **确定变更名称**

   有名称就用，没有则：
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择
   - 多个变更时 `marchen list --json` + **AskUserQuestion** 让用户选

   **重要**：不要猜测或自动选择，必须让用户确认。

2. **检查完成度**

   ```bash
   marchen status <name> --json
   ```

   解析 JSON，检查：
   - `artifacts`：每个 artifact 的 `status` 是否为 `filled`
   - `tasks.completed` vs `tasks.total`（`tasks` 为 null 时视为无任务，跳过检查）

   **如果全部完成：** 直接进入下一步。

   **如果有未完成的 artifact 或 task：**
   - 显示警告，列出未完成项
   - 用 **AskUserQuestion** 确认是否继续
   - 用户确认后继续，不阻塞

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

- 未提供名称时必须用 AskUserQuestion 让用户选择
- 用 `status --json` 检查完成度，不要自己读文件判断
- 警告不阻塞归档，只提醒 + 确认
- 使用 AskUserQuestion 时，选项不超过 4 个
