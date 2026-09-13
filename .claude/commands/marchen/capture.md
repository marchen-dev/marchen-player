---
name: "Marchen: Capture"
description: 把尚未准备实施的当前讨论提炼为可恢复的 Idea
category: Workflow
tags: [workflow, capture, idea]
---

把当前讨论保存为 `marchen/ideas/<name>.md`，供后续 explore、lite 或 propose 使用。

**Capture 保存的是探索状态快照，不是聊天记录。** 只保留后续继续判断所需的背景、结论和问题，不逐句复制对话。

---

## 1. 判断是否适合 Capture

- 尚未创建正式 change：可以创建或更新 Idea。
- 正在讨论 open change，且洞察直接影响其范围、需求、设计或任务：优先建议 `/marchen:update <change>`，不要另建重复 Idea。
- 正在讨论 open change，但用户明确要把独立旁支暂存到以后：可以 Capture 为新 Idea。

## 2. 检查已有 Idea

```bash
marchen idea list --json
```

根据名称、标题、摘要和标签判断当前主题是否与已有 Idea 相同：

- 唯一明确属于同一主题：读取完整内容与 revision。
  ```bash
  marchen idea show <name> --json
  ```
- 多个可能相同：让用户选择，不要猜。
- 建议名称已存在但主题不同：改用更明确的 kebab-case 名称，必要时询问用户。
- 没有匹配：创建新 Idea。

## 3. 生成状态快照

生成带 frontmatter 的完整 Markdown。不要填写 `format`、`createdAt`、`updatedAt`，这些字段由 CLI 管理。

```md
---
title: 面向人的标题
summary: 一句话说明这个想法及当前关注点
tags:
  - tag-a
  - tag-b
---

> 本文记录尚未定案的探索背景；晋升后以正式变更产物为准。

## 背景与价值

为什么讨论它，想解决什么。

## 已确认

- 已经明确且仍然有效的事实或决策。

## 当前倾向

- 尚未成为正式决策，但目前偏向的方案及原因。

## 待确认

- 下次继续时需要回答的问题。

## 已否决

- 不再考虑的方案及原因，避免重复讨论。

## 相关上下文

- 使用项目相对路径记录相关文件、change 或 archive；没有则写“无”。

## 下次从这里继续

一句可直接交给 Explore 的继续提示。
```

内容应调和为当前完整状态，不要把新内容追加成时间线或聊天日志。没有内容的推荐章节可以写“无”，不要编造。

## 4. 隐私检查

写入前必须检查并清理：

- Secret、Token、Cookie、私钥、签名 URL
- 账号、地址、订单号等个人数据
- `/Users/<name>/...`、`C:\Users\<name>\...` 等绝对本机路径，改成项目相对路径或非识别性描述
- 与继续探索无关的内部数据

CLI 不能判断任意自然语言是否属于组织机密。Idea 默认是 Git 可追踪的项目文件，提醒用户提交前 review；不要执行 `git add`、commit 或 push。

## 5. 通过 CLI 保存

优先使用执行工具原生的 stdin 能力。只能使用 shell 重定向时，使用不展开变量的带引号 heredoc，并选择不会出现在正文中的唯一结束标记。

创建：

```bash
marchen idea create <name> --stdin --json <<'MARCHEN_IDEA_EOF'
<完整 Markdown>
MARCHEN_IDEA_EOF
```

更新已有 Idea：先保留 `show --json` 返回的 revision，调和旧内容与当前讨论后提交完整新文档。

```bash
marchen idea update <name> --if-revision '<revision>' --stdin --json <<'MARCHEN_IDEA_EOF'
<完整 Markdown>
MARCHEN_IDEA_EOF
```

revision 冲突时，不要强制覆盖。重新 show，调和最新内容后再更新；存在实质冲突则请用户决定。

写入成功后执行：

```bash
marchen idea show <name> --json
```

确认名称、标题、摘要、正文和新 revision 均可读取。

## 输出

说明创建或更新了哪个 Idea，并给出后续入口：

```text
/marchen:explore idea:<name>
/marchen:lite idea:<name>
/marchen:propose idea:<name>
```

不要自动启动下一阶段。

## 护栏

- 不保存完整聊天原文
- 不把未确认倾向写成正式决策
- 不覆盖同名但不同主题的 Idea
- 更新必须携带刚读取到的 revision
- 写入失败或验证失败时，不声称已经 Capture
- 不自动执行 Git 操作
