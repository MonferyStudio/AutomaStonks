import { Vector2 } from './Vector2';

export enum Direction {
  Up = 0,
  Right = 1,
  Down = 2,
  Left = 3,
}

const DIRECTION_VECTORS: Record<Direction, Vector2> = {
  [Direction.Up]: Vector2.UP,
  [Direction.Right]: Vector2.RIGHT,
  [Direction.Down]: Vector2.DOWN,
  [Direction.Left]: Vector2.LEFT,
};

const DIRECTION_NAMES: Record<Direction, string> = {
  [Direction.Up]: 'Up',
  [Direction.Right]: 'Right',
  [Direction.Down]: 'Down',
  [Direction.Left]: 'Left',
};

export function directionToVector(dir: Direction): Vector2 {
  return DIRECTION_VECTORS[dir];
}

export function directionName(dir: Direction): string {
  return DIRECTION_NAMES[dir];
}

export function rotateDirectionCW(dir: Direction): Direction {
  return ((dir + 1) % 4) as Direction;
}

export function rotateDirectionCCW(dir: Direction): Direction {
  return ((dir + 3) % 4) as Direction;
}

export function oppositeDirection(dir: Direction): Direction {
  return ((dir + 2) % 4) as Direction;
}

export const ALL_DIRECTIONS: readonly Direction[] = [
  Direction.Up,
  Direction.Right,
  Direction.Down,
  Direction.Left,
];
