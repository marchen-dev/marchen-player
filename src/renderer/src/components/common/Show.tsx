import type { JSX } from 'react'

type RequiredParameter<T> = T extends () => unknown ? never : T

function Show<T, TRenderFunction extends (item: T) => JSX.Element>(props: {
  when: T | boolean
  fallback?: JSX.Element
  children: JSX.Element | RequiredParameter<TRenderFunction>
}): any {
  const { when, fallback = null, children } = props

  if (typeof when === 'boolean') {
    return when ? children : fallback
  } else {
    return when ? (typeof children === 'function' ? children(when) : children) : fallback
  }
}

export default Show
