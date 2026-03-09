export class Vector2 {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  equals(other: Vector2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  manhattanDistance(other: Vector2): number {
    return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
  }

  toKey(): string {
    return `${this.x},${this.y}`;
  }

  rotate90CW(): Vector2 {
    return new Vector2(-this.y, this.x);
  }

  rotate90CCW(): Vector2 {
    return new Vector2(this.y, -this.x);
  }

  rotate180(): Vector2 {
    return new Vector2(-this.x, -this.y);
  }

  static fromKey(key: string): Vector2 {
    const [x, y] = key.split(',').map(Number);
    return new Vector2(x, y);
  }

  static readonly ZERO = new Vector2(0, 0);
  static readonly UP = new Vector2(0, -1);
  static readonly DOWN = new Vector2(0, 1);
  static readonly LEFT = new Vector2(-1, 0);
  static readonly RIGHT = new Vector2(1, 0);
}
