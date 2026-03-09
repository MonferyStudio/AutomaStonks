import type { Container } from 'pixi.js';

export interface IRenderable {
  isDirty: boolean;
  readonly displayObject: Container;
  render(): void;
  markDirty(): void;
}
