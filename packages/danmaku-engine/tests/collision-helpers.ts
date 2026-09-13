export interface CollisionRect {
  id: string
  left: number
  right: number
  top: number
  bottom: number
}

export interface CollisionPair {
  first: CollisionRect
  second: CollisionRect
}

export const isVisibleRect = (rect: CollisionRect, viewportWidth: number, viewportHeight: number) =>
  rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight

export const findRectIntersections = (
  rects: ReadonlyArray<CollisionRect>,
  tolerance = 0.5,
): CollisionPair[] => {
  const intersections: CollisionPair[] = []
  for (let firstIndex = 0; firstIndex < rects.length; firstIndex += 1) {
    const first = rects[firstIndex]!
    for (let secondIndex = firstIndex + 1; secondIndex < rects.length; secondIndex += 1) {
      const second = rects[secondIndex]!
      const horizontal =
        first.left < second.right - tolerance && first.right > second.left + tolerance
      const vertical =
        first.top < second.bottom - tolerance && first.bottom > second.top + tolerance
      if (horizontal && vertical) intersections.push({ first, second })
    }
  }
  return intersections
}
