---
name: marchen-update
description: 修订变更的已有规划产物并双向调和保持一致。适用于用户想修改变更的计划(proposal/specs/design/tasks)、把新决策合入计划、或在编辑后让各产物重新对齐。只改规划产物,绝不修改实现代码。
---

修订变更的已有规划产物,并保持彼此一致。绝不修改代码。

---

**输入**:用户的请求应包含变更名称,或可从上下文推断;通常还带着修改诉求(如"design 改用 X")。

**流程**

1. **选择变更**

   有名称就用,没有则:
   - 从对话上下文推断
   - 只有一个 open 变更时自动选择,并明示"使用变更: `<name>`"
   - 多个变更时 `marchen list --json` + **AskUserQuestion** 让用户选,选项展示名称、schema、任务进度、创建时间(`createdAt`),最近创建的标记"(推荐)"
   - open 变更较多、创建时间不足以判断时,可用 `ls -dt marchen/changes/*/` 按最近改动排序辅助推荐(该命令不可用时忽略,退回 createdAt)

   **重要**:多个候选时绝不猜测或自动选定,始终让用户决定。

2. **获取产物清单**

   ```bash
   marchen status <name> --json
   ```

   返回 JSON 包含:
   - `schema`:该变更使用的工作流 schema
   - `artifacts[]`:各产物的 `id`、`status`(filled / empty / missing / no-content)和 `path`(相对变更目录)
   - specs 类型的产物额外带 `capabilities[]`,实际文件为 `specs/<capability>/spec.md`
   - `workflow` 与 `tasks`:依赖状态与任务进度

   产物的 id 和路径来自当前 schema——**不要假设产物名字,不要基于硬编码的产物名做分支判断**。自定义 schema 必须原样可用。

   可编辑对象是 `status` 为 `filled` 的产物文件,真实路径为 `marchen/changes/<name>/<path>`(specs 按 capabilities 展开到各 spec.md)。

3. **理解诉求**

   - 用户提出了具体修改("design 现在改用 X")→ 以此作为起点编辑。
   - 只说"update"/"让它自洽" → 当作一致性审查:通读已有产物,互相对照,找出矛盾、缺口和重复。

4. **读取并调和**

   - 读取诉求涉及的产物,以及该变更其余 filled 产物。
   - 先落实用户要求的修改,然后逐个检查其他产物与它是否一致——**任意方向**:改后置产物可能需要回改前置产物,不是只有顺流而下。构建顺序是好用的阅读顺序,不是修订方向的约束。
   - 记录所有因此不一致、缺失或矛盾的地方。
   - 只修订已存在的文件。**不要创建**尚不存在的产物,也不要在 specs 下新建 capability 目录——记录下来,第 6 步告知用户。
   - 变更本来就自洽时,直接说明,不做任何修改。

5. **逐个产物确认后写入**

   - 展示每处拟修订的内容和理由,用户确认后才写入。
   - 用户拒绝的修订不写,该产物保持原样。
   - 需要大幅重写时,先获取该产物的格式规则和模板:

     ```bash
     marchen instructions <name> <artifact-id> --json
     ```

6. **指出下一步(仅建议,绝不代为执行)**

   - 还有 empty / missing 的产物 → 告知用户,建议按 `marchen instructions` 的指引补全。
   - 变更已实现过(tasks 已勾选)→ 代码可能已和修订后的计划不符,建议 `/marchen:apply` 把差异带进代码。
   - 全部完成且已实现 → 建议 `/marchen:archive`。

**输出**

每次调用结束时展示:
- 修订了哪些产物(以及哪些拟修订被用户拒绝)
- 哪些缺失产物被记录但未创建
- 变更当前所处状态,和推荐的下一条命令

**护栏**

- 只改规划产物——**绝不修改实现代码**(update 不是 apply)。修订后的计划意味着要改代码时,停下来,指向 `/marchen:apply`。
- 使用 `marchen status` 报告的产物 id 和路径;绝不基于硬编码产物名分支。
- 只编辑已存在的文件;不推进构建前沿:不创建新产物、不在 specs 下新建 capability——补全是 propose/instructions 的职责。
- 每处修改写入前必须经用户确认;update 是专门的修订动作,不是 explore 式的顺手捕获。
- 如果诉求改变的是变更的**意图**而非细化,建议用 `/marchen:propose` 重开一个新变更("修订 vs 重开"启发式)。
