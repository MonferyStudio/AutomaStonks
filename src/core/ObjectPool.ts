export class ObjectPool<T> {
  private pool: T[] = [];
  private activeCount = 0;

  constructor(
    private factory: () => T,
    private reset: (item: T) => void,
    initialSize: number = 0,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  acquire(): T {
    this.activeCount++;
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(item: T): void {
    this.activeCount--;
    this.reset(item);
    this.pool.push(item);
  }

  get available(): number {
    return this.pool.length;
  }

  get active(): number {
    return this.activeCount;
  }

  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }
}
