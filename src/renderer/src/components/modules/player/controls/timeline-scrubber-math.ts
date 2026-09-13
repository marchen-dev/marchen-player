export const timelineTimeFromPointer = (
  clientX: number,
  left: number,
  width: number,
  duration: number,
) => {
  if (width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0
  return clamp((clientX - left) / width, 0, 1) * duration
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
