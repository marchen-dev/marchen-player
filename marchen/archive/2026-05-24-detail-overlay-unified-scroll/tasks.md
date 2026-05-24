## 背景

`DetailOverlay` 当前是「banner 固定 + body 独立滚动」双滚动区，poster 用 `margin-top:-120px` 上溢到 banner。滚动时 banner 不动、poster 跟 body 上移，导致 poster 上半被 banner 遮住下半露在内容区，视觉破碎。

改为「统一滚动容器」（Apple TV+ / Infuse 标准模式）：banner 与 body 一起流式滚动，新增 `.library-dt-scroll` 包裹两者并接管滚动。close 按钮保持 absolute 不随滚动。

## 1. 改 DOM

- [x] 1.1 `DetailOverlay.tsx`：在 banner 和 body 外面套一个 `<div className="library-dt-scroll">`（close 按钮仍留在 `.library-dt` 下）

## 2. 改样式

- [x] 2.1 `library.css` `.library-dt`：去掉 `display: flex; flex-direction: column`（不再需要分割两块）
- [x] 2.2 `library.css` 新增 `.library-dt-scroll`：`height: 100%; overflow-y: auto;` + 复用原 body 滚动条样式
- [x] 2.3 `library.css` `.library-dt-banner`：去掉 `flex-shrink: 0`（不再是 flex 子项）
- [x] 2.4 `library.css` `.library-dt-body`：去掉 `flex: 1; overflow-y: auto`，保留 `margin-top: -120px` 与 grid 布局
- [x] 2.5 `library.css` 滚动条选择器从 `.library-dt-body` 改到 `.library-dt-scroll`
