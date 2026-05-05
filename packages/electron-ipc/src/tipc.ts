import type { ActionFunction } from './types'

const createChainFns = <TInput = void>() => {
  return {
    input<T>() {
      return createChainFns<T>()
    },

    action: <TResult>(action: ActionFunction<TInput, TResult>) => {
      return { action }
    },
  }
}

export const tipc = {
  create() {
    return {
      procedure: createChainFns<void>(),
    }
  },
}
