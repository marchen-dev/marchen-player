/** Provider 与 Context consumer 共用同一门槛，避免 cancel/换片的中间帧脱离 Provider。 */
export const isPlayerSessionReady = (...dependencies: ReadonlyArray<unknown>) =>
  dependencies.every(Boolean)
