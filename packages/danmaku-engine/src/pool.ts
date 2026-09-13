export class DanmakuNodePool<T> {
  private available: T[] = []
  private active = new Set<T>()
  private allocated = 0

  constructor(
    private readonly maxNodes: number,
    private readonly createNode: () => T,
    private readonly resetNode: (node: T) => void,
  ) {}

  acquire(): T | null {
    const node = this.available.pop() ?? (this.allocated < this.maxNodes ? this.create() : null)
    if (!node) return null
    this.active.add(node)
    return node
  }

  release(node: T): void {
    if (!this.active.delete(node)) return
    this.resetNode(node)
    this.available.push(node)
  }

  releaseAll(): void {
    for (const node of [...this.active]) this.release(node)
  }

  get activeCount() {
    return this.active.size
  }

  get allocatedCount() {
    return this.allocated
  }

  private create() {
    this.allocated += 1
    return this.createNode()
  }
}
