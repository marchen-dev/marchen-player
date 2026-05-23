---
name: "Marchen: Review"
description: 对照变更意图检查代码实现，支持 chrome-devtools MCP 的 UI 场景验证
category: Workflow
tags: [workflow, review]
---

对照变更的 artifact 检查代码改动，必要时驱动浏览器验证 UI 行为，报告遗漏、偏差和阻塞。

---

**输入**：`/marchen:review` 后面跟变更名称，或省略自动推断。

**流程**

1. **选择变更**

   有名称就用，没有则：
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择
   - 多个变更时 `marchen list --json` + **AskUserQuestion** 让用户选

   显示："Review 变更: `<name>`"

2. **嗅探 diff 中的 UI 改动**

   执行 `git diff --name-only HEAD`，判断改动是否涉及前端 UI（组件、样式、模板、静态资源等）。命中则记下命中文件，用于下一步的提示。

3. **AskUserQuestion 选择 review 模式**

   用 **AskUserQuestion** 让用户三选一：

   - **代码 review**（默认）：对照 artifact 检查 git diff，不跑代码
   - **UI 验证**：用 chrome-devtools MCP 实际打开页面验证 specs 中的场景
   - **两者都做**：先代码、再 UI

   若上一步命中 UI 文件，在问题描述里附一句："检测到 diff 涉及 UI 文件（<列出命中文件>），建议选 UI 验证或两者都做。"
   未命中时不附加提示，默认推荐"代码 review"。

   保存用户选择为 `<mode>`。

4. **获取意图与改动（公共前置）**

   - 执行 `marchen instructions <name> apply --json`，从返回 JSON 的 `context` 数组里读取 `status` 为 "filled" 的 artifact（proposal/specs/design/tasks）作为变更意图
   - 执行 `git diff HEAD`；为空则 `git diff HEAD~1`；仍为空则报告 "未检测到代码改动" 并结束

   diff 大到可能挤占 context 时，先 `git diff --stat HEAD` 看摘要，再按需读单个文件 diff。

5. **代码 review**（mode 为 "代码 review" 或 "两者都做" 时执行）

   逐条对照变更意图和代码改动，输出报告：

   **任务完成度** — tasks 中每个任务是否有对应改动：
   - ✅ 任务: <描述> — 已实现
   - ❌ 任务: <描述> — 未找到对应改动

   **一致性检查** — 实现是否符合 design 决策：
   - ✅ <决策> — 已遵守
   - ⚠️ <决策> — 实现有偏差：<说明>

   **需求覆盖** — specs 中需求是否被覆盖：
   - ✅ <需求> — 已覆盖
   - ❌ <需求> — 未覆盖

   **发现的问题（如有）**
   - <文件:行号> <问题描述>

   全部通过：输出 "✅ 代码 review 通过。"

   遇到无法判断的情况（tasks 描述与 diff 对不上但可能是改名了、spec 表述含糊等），直接用 **AskUserQuestion** 就地问用户，不要积攒到最后。

6. **UI 验证**（mode 为 "UI 验证" 或 "两者都做" 时执行）

   ### a. 检测 chrome-devtools MCP 可用性

   尝试调用 chrome-devtools MCP 的只读探测工具（例如列出已打开的页面）。工具不存在或调用失败 → 在报告里写：

   > ⏭ chrome-devtools MCP 不可用，跳过 UI 验证。
   > 安装方法：`npx chrome-devtools-mcp@latest`，并参考所用 AI 工具的 MCP 配置文档将其注册。

   然后跳过本节剩余步骤。

   ### b. 提取待验证场景

   优先从变更的 specs 文件中提取所有 `#### 场景:` 块（按 spec 文件分组）。
   若 specs 不存在或不含场景 → 退化到从 tasks/proposal 推断 UI 相关验证点，并在报告中标注 "基于 tasks 推断，覆盖度可能不完整"。
   两者都没有可提取场景 → 报告 "未找到可验证的 UI 场景" 并跳过本节。

   ### c. 推断 dev server URL

   从项目文件（脚本、框架配置、环境变量、README 等）推断 dev server 地址和启动命令，不要硬猜端口。

   推出候选 URL 后用 chrome-devtools MCP 的导航工具打开，再用快照工具确认页面像被测应用（合理 title、含框架 root 节点或变更描述涉及的标志性内容）。看着不像被测应用 → 当作未能推断。

   推不出 URL → 全部场景 ⏭ "URL unknown"，在报告里说明推断依据，提示用户确认地址后重新运行 review，跳过本节执行步骤。

   ### d. 推断到 URL 但 dev server 未启动 → 询问是否帮忙起

   推出来 URL 但导航失败（连接拒绝）→ 主会话 **AskUserQuestion**，附上推断依据和启动命令：

   - **帮我起 dev server 然后继续**
   - **我手动起，起完告诉你**
   - **跳过 UI 验证**

   选"帮我起"：
   1. 用 Bash 的 `run_in_background` 执行推断到的启动命令（如 `pnpm dev`、`npm run dev`）
   2. 轮询端口直到可访问；出现明显异常（进程退出 / 长时间无任何输出 / 报错日志）才判定启动失败，让用户手动检查
   3. 启动成功后继续执行后续步骤，并在 review 结束时显式告知用户后台进程 PID 和端口，提示 "用完请自行 kill <PID>"——MUST NOT 自动 kill

   选"我手动起"：等用户告知启动完成后继续；用户可以新会话执行 `/marchen:review` 重跑。

   选"跳过 UI"：所有场景 ⏭ "dev server 未启动"，跳过后续步骤。

   ### e. 乐观执行场景

   对每个待验证场景：

   1. 用 chrome-devtools MCP 的导航工具打开对应路径
   2. 用快照工具观察页面状态
   3. 把场景的 GIVEN/WHEN/THEN 翻译成具体交互（点击、填写、读取文本）并执行
   4. 比对页面状态与场景预期

   遇到阻塞（登录墙、权限不足、缺数据、表单需要真实输入等）：**主会话可以就地 AskUserQuestion**——例如"需要登录账号才能继续，提供测试账号？/ 跳过这个场景 / 暂停 review"，而不必积攒到最后。

   仍无法继续的场景 → 记录 ⏭ + 阻塞原因，跳到下一个。
   场景翻译不出具体操作（例如纯后端行为描述）→ ⏭ "不适合 UI 验证"。

   ### f. UI 报告格式

   ```
   ## UI 验证（chrome-devtools MCP）

   测试目标：<URL 或 "未确定">

   ✅ <场景标题> — 通过
        说明：<可选简述>
   ❌ <场景标题> — 失败
        证据：<console error 摘要 / 页面文案 / 关键截图路径>
   ⏭ <场景标题> — 跳过：<阻塞原因>
   ```

7. **展示报告并按结果分支**

   - **全部通过且无 ⏭**：提示 "可以用 `/marchen:archive` 归档。"
   - **有 ❌ 失败**：提示用户修复后可以再次 `/marchen:review`。
   - **有 ⏭ 跳过**：用 **AskUserQuestion** 让用户选择：
     - **补信息后继续**：收集所需信息（账号、数据等），就地再跑被跳过的场景
     - **跳过这些场景，继续归档**：保留报告，提示 `/marchen:archive`
     - **暂停去修复**：什么都不做

   如本次 review 启动了后台 dev server，再次提醒用户进程信息（PID/端口）。

**护栏**

- 不要修改任何代码，只报告（review 不是 apply）
- UI 验证阻塞即停，不要硬闯（不登录、不猜数据、不绕权限）；要继续就向用户索取信息
- 起 dev server 必须先获得用户授权（AskUserQuestion）；起完不自动 kill，告知 PID 让用户自行管理
- 用户提供的凭据/账号等敏感数据：不写入任何 artifact，不在报告里复述明文，截图前对密码/token/邮箱等敏感字段脱敏或回避
- 大 diff 先看 `git diff --stat`，按需读单个文件，避免灌爆 context
- 使用 AskUserQuestion 时，选项不超过 4 个
