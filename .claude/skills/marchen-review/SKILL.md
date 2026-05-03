---
name: marchen-review
description: 对照变更意图检查代码实现的完整性和一致性。适用于 apply 完成后、归档前的检查。
---

对照变更的 artifact 检查代码改动，报告遗漏和偏差。

---

**输入**：用户的请求应包含变更名称，或可从上下文推断。

**流程**

1. **选择变更**

   有名称就用，没有则：
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择
   - 多个变更时 `marchen list --json` + **AskUserQuestion** 让用户选

   显示："Review 变更: `<name>`"

2. **Spawn sub-agent 执行 review**

   spawn 一个 sub-agent，传入以下 prompt：

   ```
   你是 reviewer，负责检查变更 "<name>" 的代码改动是否完整实现了变更意图。

   ## 第一步：获取变更意图

   执行以下命令获取变更的所有 artifact 内容：

   marchen instructions <name> apply --json

   从返回的 JSON 中读取 `context` 数组，其中每个 `status` 为 "filled" 的项
   就是一个 artifact，包含 `id` 和 `content` 字段。这些就是变更意图。

   ## 第二步：获取代码改动

   执行 `git diff HEAD` 获取代码改动。
   如果 diff 为空，尝试 `git diff HEAD~1`。
   如果仍为空，报告 "未检测到代码改动" 并结束。

   ## 第三步：对照检查

   逐条对照变更意图和代码改动：

   **任务完成度** — 检查 tasks 中每个任务是否有对应的代码改动：
   - ✅ 任务 1: <描述> — 已实现
   - ❌ 任务 2: <描述> — 未找到对应改动

   **一致性检查** — 检查实现是否符合 design 中的设计决策：
   - ✅ <决策> — 已遵守
   - ⚠️ <决策> — 实现有偏差：<说明>

   **需求覆盖** — 检查 specs 中的需求是否都被覆盖：
   - ✅ <需求> — 已覆盖
   - ❌ <需求> — 未覆盖

   **发现的问题（如有）**
   - <文件:行号> <问题描述>

   全部通过时输出：
   "✅ Review 通过，实现与变更意图一致。"

   ## 约束

   - 重点检查完整性和一致性，不做风格审查
   - 不报告缺少注释
   - 不要修改任何代码，只报告
   ```

3. **展示报告**

   将 sub-agent 返回的 review 报告展示给用户。

   全部通过时：
   "可以用 `marchen archive <name>` 归档。"

   有问题时：
   提示用户修复后可以再次 review。

**护栏**

- 必须使用 sub-agent 执行 review，不要在主会话中读 diff
- 不要修改任何代码，只报告
- 使用 AskUserQuestion 时，选项不超过 4 个
