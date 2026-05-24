import type {PageHeaderState} from '@renderer/atoms/page-header';
import { pageHeaderAtom  } from '@renderer/atoms/page-header'
import { useSetAtom } from 'jotai'
import { useLayoutEffect } from 'react'

/**
 * 把当前 page 的 title / actions / variant 注入 AppHeader。
 * 用 useLayoutEffect 在 DOM commit 前同步注入，避免路由切换时一帧空闪。
 * page 卸载时自动 reset，下游 page 接管时再覆盖。
 *
 * 调用方负责保证 title/actions ReactNode 引用稳定（useMemo），
 * 否则每次渲染都会 set 一次 atom。
 */
export function usePageHeader(state: PageHeaderState): void {
  const set = useSetAtom(pageHeaderAtom)

  // 不在卸载时 reset：AnimatedOutlet 配合 framer-motion 时新旧 page 短暂共存，
  // 旧 page 的延迟 cleanup 会擦掉新 page 已注入的 title。
  // 后果：未调用 usePageHeader 的路由会继承上一个 page 的 title。
  useLayoutEffect(() => {
    set(state)
  }, [set, state])
}
