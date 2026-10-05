## 背景

弹幕从加载到上屏的路径如下：

```
DanmakuEntry[] ─ mergeSources ─▶ mergedComments ─ convertDandanplayComments ─▶ DanmakuItem[]
   ─ 繁→简 ─▶ renderer.replaceItems ─▶ DanmakuEngineCore(timeline → collectCandidates → placeCandidates) ─▶ DOM
```

与本次相关的现状与约束：

- `replaceItems` 会清空全部在屏节点并重建时间线。繁简开关走的就是这条路，切换时整屏清空；不清屏的只有速度、字号、显示区域（`updateConfig(config, false)`）。
- `DanmakuItem` 只有 `id / time / text / mode / color`，不带用户与来源。链接导入的 B 站、优酷弹幕把用户段写死为 `0`。
- 弹幕节点是池化的原生 `span`，由 `DomDanmakuRenderer` 直接管理，宽度参与测量和碰撞。悬停暂停固定开启；当前 `onclick` 负责复制，`ondblclick` 拦截冒泡。
- 双击全屏只绑定在与弹幕层并列的 `InteractionSurface` 上，弹幕节点上的事件到不了那里。
- 弹幕列表弹窗通过 `buildDanmakuList` 另行派生带来源的行，id 空间与渲染器不同。
- `DanmakuSetting` 只挂载在播放器侧栏，应用设置弹窗里没有弹幕分区。
- `packages/*` 是纯 TS 包，不得依赖遥测 SDK，也不应引入 OpenCC。

## 目标与非目标

**目标：**

- 一套判定逻辑同时服务渲染器和弹幕列表，两处结果必然一致。
- 规则变化不清屏，只撤掉命中的在屏弹幕。
- 引擎包不认识"规则"，只认识"哪些 id 不出现"。
- 悬停工具条不污染弹幕节点的测量与池化。

**非目标：**

- 按用户屏蔽、重复合并、按作品规则、按颜色、导入导出、单条规则启停。
- 把规则判定挪到 Worker。
- 让繁简开关也不清屏（可复用本次的引擎入口，但不在本次范围）。
- 弹幕文字的点击、双击放行给播放器。

## 决策

### 1. 判定在服务层，生效在引擎候选出口

服务层算出被屏蔽的 id 集合，引擎新增 `setBlockedIds(ids)`：保存集合，`collectCandidates` 跳过集合内的条目，不改时间线、不递增 revision。渲染器对应的 `setBlockedIds` 在调用引擎后，遍历在屏动画表，把命中的条目走既有的 `releaseNode` 撤掉，轨道占用随之释放。

没有选的两条路：

- **在 `useMemo` 里直接过滤 items 再 `replaceItems`**：实现最少，但每次改规则整屏清空；悬停屏蔽一条时尤其刺眼。若改成"替换但保留在屏"，时间线按当前时间重新定位后，已取出但仍在前瞻窗口内的条目会被二次发出，还得另做去重。
- **把规则谓词传进引擎逐帧判定**：引擎要么依赖 OpenCC，要么接收一个不透明回调；每帧跑用户正则，也拿不到"本集屏蔽多少条"这个总数。

在 `collectCandidates` 处跳过，天然满足"被屏蔽的弹幕不占同屏名额"，因为名额判断在其后的 `placeCandidates`。

### 2. 规则模型与存储

`playerSettingAtom` 新增一个字段：

```
danmakuBlock: {
  enabled: boolean                                  // 默认 true
  modes: { scroll: boolean; top: boolean; bottom: boolean }   // 默认全 false
  rules: Array<{ type: 'keyword' | 'regex'; pattern: string }>
}
```

- 规则以 `type + pattern` 为身份，不另设 id。
- 关键词在入库时就归一化（去首尾空白、转简体、转小写），所以「劇透」与「剧透」自然判重，列表里显示的也是归一化后的文本。
- 正则的 `pattern` 存两个斜杠之间的原文，不做简繁转换；编译时固定加 `i`。不加 `u`，避免 `\-` 之类常见但在 Unicode 模式下非法的写法被拒。
- atom 的 `normalize` 只做结构校验、去重和 500 条截断，放在不依赖 OpenCC 的独立文件里，避免设置初始化时拉起字典。
- 上限常量（规则 500 条、关键词 200 字符）与该文件放在一起。

沿用现有设置的 localStorage 存储，多窗口已有订阅同步。

### 3. 判定模块

新增 `services/player-runtime/danmaku/danmaku-block.ts`，全部为纯函数：

- `parseBlockRuleInput(input)`：区分关键词与正则、归一化、校验，返回规则或带原因的失败。
- `createDanmakuBlocker(settings)`：总开关关闭时返回空判定；否则编译规则，返回 `(target) => 命中信息 | null`。命中信息区分关键词、正则、类型，供列表的提示文案使用。存量规则里编译失败的正则直接跳过，不让一条坏规则废掉全部屏蔽。
- 判定对象是"归一化文本 + mode"。归一化文本按 items 数组整体预计算并缓存（只依赖 items），规则变化时不重复做简繁转换。现有 `toSimplified` 的缓存上限是 2 万条、超限即清空，不适合承担这份缓存。

渲染器侧（`context.tsx`）用 items 的归一化结果加 blocker 得到 id 集合；列表侧（`danmaku-list.ts`）对自己的行调用同一个 blocker，给行附上命中信息。两边 id 空间不同，但共用判定函数，结果一致。

已屏蔽条数取列表侧的统计，口径与"弹幕列表"按钮上的总数相同（已勾选来源、应用偏移后实际在用的弹幕），只在管理弹窗打开时计算。

### 4. 悬停工具条

渲染器内只创建**一个**工具条元素，挂在弹幕层容器下，悬停谁就定位到谁旁边；不往弹幕节点里加子元素。逻辑拆到独立文件，`DomDanmakuRenderer` 只负责在节点的进入、离开、释放时通知它。

- **出现**：`mouseenter` 立即暂停（现状），同时起一个 150ms 定时器，到点才显示。
- **连续悬停区域**：节点 `mouseleave` 时若 `relatedTarget` 在工具条内则忽略；工具条 `mouseleave` 时若回到原节点则忽略；其余情况结束悬停并恢复运动。工具条外层是透明的命中区域，把箭头所占的高度也包含在内，并与文字底边重叠 2 像素，鼠标从文字移向按钮的路径上没有空隙。
- **定位**：显示时读一次节点矩形（此时已暂停，位置稳定），换算到容器坐标。工具条放在文字正下方、以鼠标横坐标为中心，带一个指回文字的箭头（验收后由"贴文字右端"改为此方案，参照 B 站：长弹幕不必追到末端才能操作）。驻留期间持续记录鼠标位置，显示后不再跟随。水平出界时夹回容器内，箭头仍指向鼠标；下方放不下时翻到文字上方。定位计算抽成纯函数，便于单测（参照 `timeline-scrubber-math.ts` 的做法）。
- **隐藏**：被悬停的条目经 `releaseNode` 释放、`clearNodes`、弹幕关闭、渲染器销毁时一并隐藏并清定时器。
- **样式**：深色半透明胶囊加同色箭头，颜色由同一个常量以内联样式给出，保证两者一致；两个原生 `button`，图标用 `icon-[mingcute--copy-2-line]` 与 `icon-[mingcute--forbid-circle-line]`（已确认图标集中存在），`title` 与 `aria-label` 给出"复制""屏蔽"。类名以字面量写在源码里，保证 Tailwind 能扫描到。保持系统箭头指针，并设置 `-webkit-app-region: no-drag`。
- **事件**：工具条拦截 `click` 与 `dblclick` 冒泡。弹幕节点的 `onclick` 改为只拦截冒泡、不再复制，`ondblclick` 保持现状，`title` 不再设置。

工具条在弹幕层内，弹幕层在全屏元素内，全屏下无需额外处理。

### 5. 屏蔽动作的归属

渲染器不接触设置。它通过构造参数拿到一个 `onBlock(text)` 回调；复制仍在渲染器内完成（沿用现有 toast 与埋点）。

新增一个与 React 组件无关的动作函数（经 `jotaiStore` 读写设置），画面工具条和弹幕列表共用：

1. 用 `parseBlockRuleInput` 把文本转成关键词规则，超过 200 字符取前 200。
2. 已达上限则提示并返回。
3. 记下操作前的总开关状态；规则不存在则追加；总开关关闭则打开。
4. 弹出带"撤销"的 toast。撤销只做逆操作（移除这条规则、恢复总开关），不整体回写旧设置，避免覆盖期间的其他改动。若规则在操作前已存在，撤销不移除它。

### 6. 界面

- **入口**：`DanmakuBlock` 组件放在 `Danmaku.tsx` 里 `<DanmakuList />` 之后，写法与之相同（`FieldLayout` + outline 按钮），文案为"管理 N 条规则"或"添加屏蔽规则"。
- **管理弹窗**：复用 `Dialog`，宽约 560px，挂到 `usePlayerPortalContainer`。自上而下：标题（含已屏蔽条数）与总开关、三个类型开关、输入框加"添加"按钮与错误提示、规则标签区（`ScrollArea`）。规则用标签展示，正则用等宽字体并带斜杠。总开关关闭时下方区域降低不透明度但不禁用。
- **弹幕列表**：行网格末尾加一个窄操作列。被屏蔽的行整体降低不透明度，在类型标记旁加"已屏蔽"标签，`title` 写明命中的规则或类型。未被屏蔽的行悬停时在操作列显示屏蔽按钮。

### 7. 遥测

全部走 `captureFeatureUsed`，不新增事件契约：

| feature         | action                         | value                             |
| --------------- | ------------------------------ | --------------------------------- |
| `danmaku_block` | `add_keyword` / `add_regex`    | 入口：`dialog` / `hover` / `list` |
| `danmaku_block` | `remove_rule` / `undo`         | —                                 |
| `danmaku_block` | `enable` / `disable`           | —                                 |
| `danmaku_block` | `mode_enable` / `mode_disable` | `scroll` / `top` / `bottom`       |
| `danmaku_block` | `open`                         | 打开时的已屏蔽条数                |
| `danmaku_copy`  | `success` / `failed`           | 不变                              |

规则内容是高基数值，不进属性。`danmaku_copy` 的触发方式变了，在 `docs/observability-runbook.md` 记录口径断点。

## 风险与权衡

- **用户正则在主线程执行。** 每次规则或弹幕变化要对全部弹幕跑一遍。弹幕文本短，正常情况下可接受，但回溯爆炸的正则会卡住界面。本次不上 Worker，改为在实现阶段实测 5 万条弹幕 × 50 条规则的耗时并记录；若明显超过一帧的几倍，再把关键词合并为单个正则或增加限制。
- **悬停屏蔽的范围比"这一条"大。** 加的是关键词规则，子串命中即屏蔽；屏蔽「草」会连带屏蔽所有含「草」的弹幕。靠撤销 toast 和列表里的"已屏蔽"标注兜底，不做精确匹配这第三种规则类型。
- **规则以归一化形式保存和显示。** 用户输入「AWSL」，列表里看到的是「awsl」。换来的是判重简单、显示与实际匹配一致。
- **撤销提示消失后只能去管理弹窗解除。** 列表里不提供解除，是为了避免点一下删掉整条正则。
- **引擎多了一个状态。** `replaceItems` 不会清掉屏蔽集合，调用方必须在换弹幕后重新下发；`context.tsx` 中保证"先换条目、后下发集合"的顺序，并在渲染器创建时补发一次。
- **悬停区域判断依赖 `relatedTarget`。** 鼠标移出窗口等情况下它可能为空，按"结束悬停"处理即可，最坏结果是工具条提前收起。
- **Web 与 Electron 行为一致**，无平台分支；剪贴板不可用时的失败提示沿用现状。
