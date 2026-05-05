/**
 * React 桥接 Hook
 *
 * 将 PlayerLoadingService 的 Observable state$ 桥接到 React 渲染周期。
 * 支持 selector 选择性订阅，避免不必要的重渲染。
 */

import type { LoadingState } from '@marchen/player-core'
import { useEffect, useRef, useState } from 'react'

import { getPlayerLoadingService } from './index'

/**
 * 订阅 service 的完整状态
 * 每次状态变化都会触发重渲染
 */
export function usePlayerLoadingState(): LoadingState {
  const service = getPlayerLoadingService()
  const [state, setState] = useState<LoadingState>(service.currentState)

  useEffect(() => {
    const sub = service.state$.subscribe(setState)
    return () => sub.unsubscribe()
  }, [])

  return state
}

/**
 * 选择性订阅 service 状态的部分字段
 * 只有 selector 返回值变化时才触发重渲染
 *
 * @example
 * const step = usePlayerLoadingSelector(s => s.step)
 * const danmaku = usePlayerLoadingSelector(s => s.step === 'playing' ? s.danmaku : null)
 */
export function usePlayerLoadingSelector<T>(
  selector: (state: LoadingState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const service = getPlayerLoadingService()
  const [value, setValue] = useState<T>(() => selector(service.currentState))
  const selectorRef = useRef(selector)
  const equalityRef = useRef(equalityFn)

  // 保持 selector 引用最新
  selectorRef.current = selector
  equalityRef.current = equalityFn

  useEffect(() => {
    const sub = service.state$.subscribe((state) => {
      const nextValue = selectorRef.current(state)
      setValue((prev) => {
        if (equalityRef.current(prev, nextValue)) return prev
        return nextValue
      })
    })
    return () => sub.unsubscribe()
  }, [])

  return value
}

/**
 * 获取 service 实例引用（用于调用命令方法）
 * 不触发重渲染
 */
export function usePlayerLoadingService() {
  return getPlayerLoadingService()
}
