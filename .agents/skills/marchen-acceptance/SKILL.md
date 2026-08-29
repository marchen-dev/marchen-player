---
name: marchen-acceptance
description: 把变更做成带证据的本地验收页，等人签核。只在 apply/lite 收尾或用户显式调用时执行。
disable-model-invocation: true
argument-hint: <change-name>
---

出示本地验收页：取证写入 `acceptance/rounds/<n>/`，灌 HTML，起本机签字服务。禁止代人点接受、打回修改或「让 AI 修改」。

---

**输入**：变更名称，或从上下文推断。

**流程**

1. **选择变更**

   有名称就用，没有则：
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择
   - 多个变更时 `marchen list --json` + **AskUserQuestion**

   显示："Acceptance 变更: `<name>`"

2. **预检**

   ```bash
   marchen status <name> --json
   marchen acceptance status <name> --json
   ```

   - 任务未勾完：AskUserQuestion 继续 / 停止
   - `git diff --stat HEAD`（空则 `HEAD~1`）没有产品向改动：说明无可出示的结果，停止。不要为此编造清单项
   - `acceptance status` 里 `decision.status` 已是 `accepted`：提示可以 `/marchen:archive`，**不要**开新轮
   - 已是 `rejected`：准备开下一轮。先把当前 `decision.json` 抄到本轮 `human-decision.json`，再把根上决定重置为 `{ "status": "pending", "items": [] }`。不要改已有 `rounds/<n>/` 里的证据

   单测、lint、tsc、CI、以及「某个 task 有对应 diff」**不准**写进验收清单。设计偏离写进该轮 `report.md`。

3. **写这一轮**

   目录：

   ```
   marchen/changes/<name>/acceptance/
     requirement.md      # 第一轮写一句目标，之后不准改
     decision.json       # 没有则写成 { "status": "pending", "items": [] }
     decision-assets/    # 人插入的附图
     rounds/<n>/
       result.json
       report.md
       assets/
   ```

   `<n>` 是已有最大轮次 + 1；没有则 `1`。

   `requirement.md` 只在不存在时写一句人能判断的目标。

   `result.json` 字段：`title`、`plan`、`cases`、`summary`、`commit`、`surfaces`。
   每条 plan/case 必须是人看得见、听得见或拿得到的结果。
   写第二轮及后续轮次前必须读取上一轮 `result.json`，并遵守案例 id 稳定规则：
   - 同一个验收目标复用原 id；文案调整或排序变化不得生成新 id
   - 新增验收目标才生成新 id
   - 已移除目标的 id 只留在历史轮次，不得拿给别的新目标复用
   同一轮的 `plan[].id` 与 `cases[].id` 必须一一对应且不得重复。
   证据路径相对本轮，如 `assets/foo.png`。只截图，不录像，不要安装 `agent-browser`。
   有浏览器自动化就截图放进 `assets/`；没有就把对应项标 `blocked`，在 `report.md` 说明。不要假装截过图。

4. **灌页并打开**

   ```bash
   marchen acceptance render <name> --json
   marchen acceptance serve <name> --json
   ```

   serve 默认前台。在本会话用后台方式启动，记下 URL。
   **禁止**用浏览器自动化点击「接受交付」、「打回修改」或「让 AI 修改」，**禁止**代发 `POST /decision`。

5. **等人**

   轮询：

   ```bash
   marchen acceptance status <name> --json
   ```

   直到 `decision.status` 不是 `pending`，或用户在对话里打断。

   - `accepted` → 询问是否归档；未经确认不得 `marchen archive`
   - `rejected` → 不归档。按 `decision.items` 的 comment 与 `images` 附图修改，修完从步骤 2 开新轮（先抄 `human-decision.json` 并重置 pending）
   - 用户说先挂着 → 留下 URL，结束

**护栏**

- `disable-model-invocation`：未显式调用、也不是 apply/lite 收尾时，不要自己开跑
- 不要改已经存在的 `rounds/<n>/`
- 不要点验收页上的写入按钮，不要装 agent-browser
- 使用 AskUserQuestion 时选项不超过 4 个
