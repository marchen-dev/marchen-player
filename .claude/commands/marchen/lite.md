---
name: "Marchen: Lite"
description: 一键式轻量变更流程。创建 lite 变更、实现任务、询问验收或归档，一气呵成
category: Workflow
tags: [workflow, lite]
---

一键式轻量变更 — 使用 lite schema 创建变更，自动实现任务，完成后询问归档。
适合 bug 修复、小改动、explore 之后的快速执行。

---

**输入**：`/marchen:lite` 后面跟变更名称（kebab-case）或变更描述。

**流程**

1. **确定变更名称**

   如果提供了输入，直接使用或从描述中提取 kebab-case 名称（如"修复登录 bug" → `fix-login-bug`）。

   如果没有输入，用 **AskUserQuestion** 工具询问：
   > "你想做什么变更？描述一下你要构建或修复的内容。"

   从回答中提取 kebab-case 名称。

   **重要**：必须理解用户想做什么才能继续。

2. **创建变更目录**

   ```bash
   marchen new <name> --schema lite
   ```

   创建 `marchen/changes/<name>/` 目录，包含 `.metadata.yaml` 和 `tasks.md` 骨架。

   如果同名变更已存在，用 **AskUserQuestion** 询问用户是继续已有变更还是换个名称。

3. **获取 tasks 指令**

   ```bash
   marchen status <name> --json
   ```

   确认变更创建成功，然后获取 tasks 的创建指令：

   ```bash
   marchen instructions <name> tasks --json
   ```

   返回 JSON 包含：
   - `template`：tasks.md 的骨架结构（含 `## 背景` 章节）
   - `instruction`：如何填充 tasks 的指导文本
   - `outputPath`：写入路径（`tasks.md`）
   - `context`：上下文信息（lite schema 下为空数组）

4. **填充 tasks.md**

   根据用户描述 + `instruction` 指引 + `template` 结构，填充 tasks.md：
   - `## 背景`：简要说明变更目的和方案
   - 任务列表：按组分类，checkbox 格式

   写入 `marchen/changes/<name>/tasks.md`。

   如果用户描述太模糊，用 **AskUserQuestion** 澄清关键信息。

5. **开始实现**

   获取实现指令：

   ```bash
   marchen instructions <name> apply --json
   ```

   返回 JSON 包含：
   - `state`：`"ready"` / `"blocked"` / `"all_done"`
   - `progress`：`{ total, completed, remaining }`
   - `context`：所有 artifact 的信息数组
   - `instruction`：实现指引
   - `changeDir`：变更目录绝对路径

   显示："变更: `<name>` | 任务: 0/N | 开始实现..."

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

   暂停时显示："暂停于任务 N/M: <原因>"，流程结束。

6. **全部完成 → 一道题**

   所有任务完成后，用 **AskUserQuestion** 只问一次：

   > "全部任务已完成 (N/N)，下一步？"
   > - 验收再归档
   > - 直接归档
   > - 只验收
   > - 先不动

   **验收再归档：** 执行 `/marchen:acceptance` 全文。等到 `decision.status` 为 accepted 再归档；若人点了「让 AI 修改」（`rejected`）则不归档，按待修改项修并开新轮。归档前 `marchen acceptance stop`。

   **直接归档：** 不要创建 `acceptance/`。读取 tasks.md 背景段生成一句话摘要，执行 `marchen archive <name> --summary "<摘要>" --json`。不要再问「尚未验收」。

   **只验收：** 执行 acceptance，不要 archive。

   **先不动：** 显示后续可用 `/marchen:acceptance <name>` 或 `/marchen:archive <name>`。

**护栏**

- 必须使用 `--schema lite` 创建变更
- tasks.md 的 `## 背景` 章节必须填写，不能留空
- 任务粒度要小到一个会话内能完成
- 如果上下文关键信息不清楚，询问用户；但小疑问优先做合理判断，保持节奏
- 已存在同名变更时必须询问用户，不要覆盖
- 实现前必须读 context 中的 artifact 内容
- 每完成一个任务立即勾选 checkbox，不要攒着
- 改动最小化，只做任务要求的事
- 不确定就暂停问，不要猜
- `instruction` 是给你的指引，不要把它原样复制到代码注释或 tasks.md 中
- 使用 AskUserQuestion 时，选项不超过 4 个
