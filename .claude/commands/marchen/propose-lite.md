---
name: "Marchen: Propose Lite"
description: 快速创建轻量变更，只需填写任务清单
category: Workflow
tags: [workflow, lite]
---

快速创建轻量变更 — 使用 lite schema，只生成 tasks.md。
适合 bug 修复、小改动、explore 之后的快速执行。

只创建：
- tasks.md（背景 + 任务清单）

完成后可用 /marchen:apply 开始实现。

---

**输入**：`/marchen:propose-lite` 后面跟变更名称（kebab-case）或变更描述。

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

5. **显示结果**

   ```bash
   marchen status <name>
   ```

**输出**

完成后显示：
- 变更名称和目录位置
- 已创建的 tasks.md 概要（任务数量）
- 提示："任务清单已就绪，可以用 `/marchen:apply` 开始实现。"

**护栏**

- 必须使用 `--schema lite` 创建变更
- tasks.md 的 `## 背景` 章节必须填写，不能留空
- 任务粒度要小到一个会话内能完成
- 如果上下文关键信息不清楚，询问用户；但小疑问优先做合理判断，保持节奏
- 已存在同名变更时必须询问用户，不要覆盖
- `instruction` 是给你的指引，不要把它原样复制到 tasks.md 中
- 使用 AskUserQuestion 时，选项不超过 4 个
