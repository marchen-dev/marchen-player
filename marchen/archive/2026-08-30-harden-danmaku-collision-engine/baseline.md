## 实现基线

### 当前状态流

- `DanmakuTimeline.collect()` 按媒体时间和 look-ahead 取出候选，候选一旦取出但未分配成功即被确定性丢弃。
- `DanmakuEngineCore.tick()` 用估算宽度分配轨道，并用 `item.time + duration` 维护独立的活动数量。
- `DanmakuLaneAllocator` 分别保存滚动最后入轨状态、顶部到期时间和底部到期时间；三种模式没有共享垂直占用。
- `DomDanmakuRenderer` 取得 placement 后才创建节点和 WAAPI 动画，节点池与核心活动数量没有完成/取消回报契约。
- 控制器通过 `onRectChange` 把 viewport 矩形传入弹幕层；拖动期间 `onDrag` 会逐帧上报。

### 已确认的状态分裂入口

1. `setExclusionRect()` 重置 allocator，但不清理活动数量、DOM 节点或 WAAPI 动画。
2. hover 只暂停/恢复 WAAPI animation，核心仍按媒体时间计算位置与过期。
3. animation 完成或节点池获取失败不会通知核心释放对应占用。
4. 顶部和底部使用独立数组，却从同一可见高度向相反方向映射 y，密集时可取得同一位置。
5. 滚动与固定弹幕使用独立占用状态，跨模式可能分配到相同垂直范围。
6. 轨道高度使用全局字号，测量只返回 Canvas 估算宽度；最终 DOM 宽高不是分配事实。
7. resize、seek、数据替换和设置热更新分别触发清理，缺少统一的原子重建语义。
8. 现有高密度验收只记录节点峰值和 Long Task，没有采样矩形证明无相交。

### 工作区边界

当前分支 `feat/player-refactor` 含播放器设置侧栏的未提交改动。本变更只编辑弹幕 workspace 包、Renderer 弹幕目录、必要的验收样本与碰撞测试；不回退或重写设置侧栏文件。
