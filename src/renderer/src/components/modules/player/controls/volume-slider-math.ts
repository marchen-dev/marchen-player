export const volumeFromPointer = (clientX: number, left: number, width: number) => {
  if (!Number.isFinite(width) || width <= 0) return 0
  return clamp((clientX - left) / width, 0, 1)
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
