# 字幕实例与呈现表面解耦

修复前：video 引用变化触发字幕 adapter 销毁，轨道初始化依赖 video，切换内核可能重新扫描
MKV、提取字体并创建 Worker。前一次为避免字幕丢失而追加 video 初始化依赖，扩大了重复工作。

修复后：
- 字幕 adapter、Canvas、字体和已加载轨道跟随 Runtime 生命周期。
- video 变化只重绑尺寸/旋转观察、metadata 事件和字幕同步调度，必要时移动现有 Canvas。
- 实例首次创建完成后，通过 readyAdapter 启动轨道初始化；初始化依赖媒体来源和实例就绪，不依赖 video。
- Runtime 结束或组件卸载时统一取消请求、释放实例与 Canvas，保留幂等销毁。

实测采用实际 Electron 开发服务与独立测试用户目录；视频读取、字幕解析和呈现均走正式路径，
只替代选择文件对话框和弹幕网络。Matroska 方法与 Worker 构造器的包装仅计数，不改变结果。

样片：Ave Mujica 06，约 977 MiB，内嵌 ASS。
- 冷启动从点击选文件到字幕可选约 9001 ms，包含导入、视频准备和首次字幕提取，不是单独解析耗时。
- 初始 Matroska.open 2 次（目录与正文）、完整字幕扫描 1 次、字幕 Worker 1 个。
- compat → native → compat → native → compat 后，以上计数均不增加。
- 四次切换均保留同一字幕 Canvas 与 Worker。切换测量约 0.9–1.1 秒，包含额外 500 ms 观察等待。
- 在 11:20.5 的有效字幕时间点截图，选轨和暂停位置保持。
- 退出后 adapter.disposed=true、instance=null、Canvas 脱离 DOM。

证据：subtitle-stable-switch.json、subtitle-stable-switch.png、subtitle-stable-release.json。
复测脚本：scripts/player-engine/tests/subtitle-session-regression.mjs。

本次没有改变 1 MiB 读取策略，也没有宣称首次 MKV 导入已恢复“近实时”；修复的是由呈现切换
造成的重复初始化与重复提取。首次扫描本身仍可进一步优化，需要单独测量读取量与分段耗时。
