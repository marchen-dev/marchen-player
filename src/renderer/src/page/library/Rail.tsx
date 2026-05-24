import type { FC, PropsWithChildren, WheelEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 横向滚动列表容器。
 *
 * 功能：
 *  - 标题 + 副标题（如「CONTINUE WATCHING」语义标签）
 *  - 右侧 ◀ ▶ 滚动按钮：点击滚动当前视口的 80%；左/右到底时按钮 disabled
 *  - 隐藏原生 scrollbar，使用 scroll-snap-type: x mandatory
 *  - 鼠标滚轮转横向滚动：监听 onWheel，把 deltaY 转 scrollLeft（鼠标用户无法横滑时仍可滚）
 *
 * 不关心卡片内容；children 由调用方传入（PosterCard / LandscapeCard）。
 */
interface RailProps extends PropsWithChildren {
  title: string
  /** 副标题 / 语义标签（如 'CONTINUE WATCHING' 或 'LIBRARY · 12'） */
  sub?: string
}

export const Rail: FC<RailProps> = ({ title, sub, children }) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)

  // 更新左右按钮的 disabled 状态。容差 4px 避免浮点误差导致按钮抖动。
  const updateNav = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  // 初次渲染、children 变化时同步一次
  useEffect(() => {
    updateNav()
  }, [updateNav, children])

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const step = Math.round(el.clientWidth * 0.8)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  /**
   * 鼠标滚轮转横向：用户在 Rail 内向下滚轮时，水平方向滚动。
   * 仅在 deltaY 主导且 deltaX 接近 0 时介入（避免抢走真正的横向 trackpad 手势）。
   */
  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const el = trackRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // 不调 preventDefault：onWheel 是 React 合成事件 + passive，无法 prevent。
      // 直接修改 scrollLeft 即可生效，外层垂直滚动会被消费掉这一段 deltaY。
      el.scrollLeft += e.deltaY
    }
  }, [])

  return (
    <section className="library-rail">
      <div className="library-rail-head">
        <h2 className="library-rail-title">{title}</h2>
        {sub && <span className="library-rail-count">{sub}</span>}
        <div className="library-rail-nav no-drag-region">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            aria-label="向左滚动"
          >
            <ArrowLeftGlyph />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            aria-label="向右滚动"
          >
            <ArrowRightGlyph />
          </button>
        </div>
      </div>
      <div
        ref={trackRef}
        className="library-rail-track"
        onScroll={updateNav}
        onWheel={handleWheel}
      >
        {children}
      </div>
    </section>
  )
}

function ArrowLeftGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m14 6-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowRightGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m10 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
