---
name: marchen-propose
description: 提出新变更，创建并填充所有 artifact。适用于用户想快速描述需求并生成完整的 proposal、specs、design、tasks。
---

提出新变更 — 创建变更目录并按依赖顺序生成所有 artifact。

将创建以下 artifact：
- proposal.md（动机和变更内容）
- specs/（每个能力的需求规格）
- design.md（技术方案）
- tasks.md（实现任务清单）

完成后可用 /marchen:apply 开始实现。

---

**输入**：用户的请求应包含变更名称（kebab-case）、变更描述，或一个/多个显式 `idea:<name>`。

如果包含 `idea:<name>`，在创建变更前逐个读取：

```bash
marchen idea show <name> --json
```

把完整 Idea 作为所有 artifact 的探索背景。只消费用户显式指定的 Idea；不要通过模糊语义匹配静默带入其他 Idea。任一指定 Idea 不存在或损坏时先停止处理。

**流程**

1. **确定变更名称**

   如果提供了输入，直接使用或从描述、Idea 标题与摘要中提取 kebab-case 名称（如"添加用户认证" → `add-user-auth`）。`idea:<name>` 是来源标识，不强制作为 change 名称。

   如果没有输入，用 **AskUserQuestion** 工具询问：
   > "你想做什么变更？描述一下你要构建或修复的内容。"

   从回答中提取 kebab-case 名称。

   **重要**：必须理解用户想做什么才能继续。

2. **创建变更目录**

   ```bash
   marchen new <name>
   ```

   创建 `marchen/changes/<name>/` 目录和 `.metadata.yaml`。

   如果同名变更已存在，用 **AskUserQuestion** 询问用户是继续已有变更还是换个名称。

3. **循环创建 artifact**

   用 **TaskCreate** 工具创建任务列表追踪进度。

   循环执行以下步骤：

   a. **查询当前状态**
      ```bash
      marchen status <name> --json
      ```
      返回 JSON 包含：
      - `workflow.next`：下一个应该创建的 artifact ID，全部完成时为 `null`
      - `workflow.ready`：当前可以创建的 artifact 列表
      - `workflow.blocked`：被阻塞的 artifact 列表
      - `artifacts`：每个 artifact 的状态详情（`id`、`status`、`path`）

      如果 `workflow.next` 为 `null` → 全部完成，跳到第 4 步。

   b. **获取创建指令**
      ```bash
      marchen instructions <name> <workflow.next> --json
      ```
      返回 JSON 包含：
      - `template`：artifact 的 markdown 骨架结构，用它作为输出文件的框架
      - `instruction`：如何填充该 artifact 的指导文本
      - `outputPath`：写入路径（相对于变更目录）
      - `context`：上下文 artifact 的信息数组，每项包含 `id`、`status`、`content`（已填充的内容直接在这里，不需要额外读文件）
      - `unlocks`：完成此 artifact 后解锁的 artifact 列表

   c. **创建 artifact**

      根据 artifact 类型处理：

      **普通 artifact（proposal / design / tasks）：**
      - 读取 `context` 中 `status` 为 `filled` 的 `content` 作为上下文
      - 如果指定了 Idea，同时读取其完整内容作为形成正式决策前的背景；区分其中的已确认事项、倾向和待确认问题
      - 按 `instruction` 指引 + `template` 结构生成内容
      - 写入 `marchen/changes/<name>/<outputPath>`
      - 写入后验证文件存在

      **specs（目录型 artifact，outputPath 为 `specs/`）：**
      - 读取 proposal 内容（在 `context` 中，`id` 为 `proposal` 的 `content`）
      - 结合显式 Idea 背景，但以 proposal 中已经确定的能力范围为准
      - 从 proposal 的"能力"章节提取能力列表（kebab-case 名称）
      - 为每个能力：
        - 创建目录 `marchen/changes/<name>/specs/<capability>/`
        - 按 `template` 结构 + `instruction` 指引生成 spec 内容
        - 写入 `specs/<capability>/spec.md`
      - 写入后验证每个 spec 文件存在

      **如果 proposal 的上下文不够清晰**（用户描述太模糊）：
      - 用 **AskUserQuestion** 澄清关键信息
      - 然后继续创建

   d. 显示进度："已创建 `<artifact-id>`"，标记任务完成，回到步骤 a。

4. **验证并晋升显式 Idea**

   ```bash
   marchen status <name> --json
   ```

   只有 `workflow.next` 为 `null`，且 proposal、specs、design、tasks 全部为 `filled` 时，才一次性晋升所有显式 Idea：

   ```bash
   marchen idea promote <idea-name> [<idea-name>...] --change <name> --json
   ```

   未使用 Idea 时跳过。任一 artifact 创建或验证失败时不得 promote，原 Idea 留在 `marchen/ideas/`。promote 失败时报告实际错误并停止，不要声称提案已经完整衔接。

5. **显示最终状态**

   ```bash
   marchen status <name>
   ```

**输出**

完成后显示：
- 变更名称和目录位置
- 已创建的 artifact 列表及简要说明
- 用纯文字（不调用 AskUserQuestion，不自动执行）提示下一步两个并列选项，由用户自行决定：

  ```
  下一步：
    /marchen:apply <name>           直接开始实现
    /marchen:propose-preview <name> 先看一眼浓缩摘要再决定
  ```

**护栏**

- 按依赖顺序创建，不跳过 artifact
- 每次循环创建一个 artifact（specs 算一个，但包含多个文件）
- 写入后验证文件存在再继续下一个
- 如果上下文关键信息不清楚，询问用户；但小疑问优先做合理判断，保持节奏
- 已存在同名变更时必须询问用户，不要覆盖
- 只读取和晋升用户显式指定的 `idea:<name>`，不得隐式消费语义候选
- 必须先完成并验证全部 artifact，再晋升 Idea；探索文件不替代正式 artifact
- `instruction` 是给你的指引，不要把它原样复制到 artifact 文件中
- 使用 AskUserQuestion 时，选项不超过 4 个；需要更多选项时合并或分步询问
