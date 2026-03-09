import { Graphics, Container } from 'pixi.js';
import { COLORS, SHADOW_OFFSET, SHADOW_ALPHA, CELL_SIZE_PX } from '@/utils/Constants';
import type { ResourceDefinition, ResourceShape } from '@/simulation/Resource';
import { Direction } from '@/utils/Direction';

const ITEM_SIZE = 12;
const ITEM_SHADOW_OFFSET = 1.5;

export class SpriteFactory {
  createItemGraphic(resource: ResourceDefinition): Container {
    const container = new Container();

    const shadow = new Graphics();
    this.drawResourceShape(shadow, resource.shape, 0x000000, ITEM_SIZE);
    shadow.alpha = SHADOW_ALPHA;
    shadow.position.set(ITEM_SHADOW_OFFSET, ITEM_SHADOW_OFFSET);
    container.addChild(shadow);

    const main = new Graphics();
    this.drawResourceShape(main, resource.shape, resource.color, ITEM_SIZE);
    container.addChild(main);

    return container;
  }

  private drawResourceShape(g: Graphics, shape: ResourceShape, color: number, size: number): void {
    const half = size / 2;
    const radius = size * 0.2;

    switch (shape) {
      case 'square':
        g.roundRect(-half, -half, size, size, radius);
        g.fill(color);
        break;
      case 'rect':
        g.roundRect(-half * 1.4, -half * 0.7, size * 1.4, size * 0.7, radius);
        g.fill(color);
        break;
      case 'circle':
        g.circle(0, 0, half);
        g.fill(color);
        break;
      case 'cloud':
        g.circle(-2, 0, half * 0.7);
        g.circle(2, -1, half * 0.6);
        g.circle(1, 2, half * 0.5);
        g.fill(color);
        break;
    }
  }

  createBeltGraphic(direction: Direction, tier: number = 1): Container {
    const container = new Container();
    const size = CELL_SIZE_PX;
    const beltColor = COLORS.BELT;

    const shadow = new Graphics();
    shadow.roundRect(1, 1, size - 2, size - 2, 4);
    shadow.fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    shadow.position.set(ITEM_SHADOW_OFFSET, ITEM_SHADOW_OFFSET);
    container.addChild(shadow);

    const bg = new Graphics();
    bg.roundRect(1, 1, size - 2, size - 2, 4);
    bg.fill(beltColor);
    container.addChild(bg);

    const railWidth = 2;
    const rails = new Graphics();
    const railOffset = size * 0.25;
    rails.rect(railOffset, 2, railWidth, size - 4);
    rails.rect(size - railOffset - railWidth, 2, railWidth, size - 4);
    rails.fill({ color: 0xffffff, alpha: 0.08 });
    container.addChild(rails);

    const arrow = new Graphics();
    const cx = size / 2;
    const cy = size / 2;
    const arrowSize = 6;
    arrow.moveTo(cx, cy - arrowSize);
    arrow.lineTo(cx + arrowSize * 0.6, cy + arrowSize * 0.3);
    arrow.lineTo(cx - arrowSize * 0.6, cy + arrowSize * 0.3);
    arrow.closePath();
    arrow.fill({ color: 0xffffff, alpha: 0.15 });
    container.addChild(arrow);

    const rotationMap = {
      [Direction.Up]: 0,
      [Direction.Right]: Math.PI / 2,
      [Direction.Down]: Math.PI,
      [Direction.Left]: -Math.PI / 2,
    };
    container.pivot.set(size / 2, size / 2);
    container.rotation = rotationMap[direction];
    container.position.set(size / 2, size / 2);

    return container;
  }

  createMachineGraphic(name: string, color: number, width: number, height: number): Container {
    const container = new Container();
    const w = width * CELL_SIZE_PX;
    const h = height * CELL_SIZE_PX;
    const radius = CELL_SIZE_PX * 0.15;

    const shadow = new Graphics();
    shadow.roundRect(0, 0, w - 2, h - 2, radius);
    shadow.fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    shadow.position.set(SHADOW_OFFSET, SHADOW_OFFSET);
    container.addChild(shadow);

    const body = new Graphics();
    body.roundRect(0, 0, w - 2, h - 2, radius);
    body.fill(color);
    container.addChild(body);

    const highlight = new Graphics();
    highlight.roundRect(0, 0, w - 2, h * 0.4, radius);
    highlight.fill({ color: 0xffffff, alpha: 0.1 });
    container.addChild(highlight);

    return container;
  }

  createIOPortGraphic(type: 'input' | 'output', direction: Direction): Container {
    const container = new Container();
    const size = CELL_SIZE_PX;
    const color = type === 'input' ? COLORS.IO_INPUT : COLORS.IO_OUTPUT;
    const portW = size * 0.6;
    const portH = size * 0.35;

    const g = new Graphics();
    g.roundRect(-portW / 2, -portH / 2, portW, portH, 3);
    g.fill(color);

    const arrowG = new Graphics();
    const aSize = 4;
    if (type === 'input') {
      arrowG.moveTo(-aSize, -aSize);
      arrowG.lineTo(aSize, 0);
      arrowG.lineTo(-aSize, aSize);
    } else {
      arrowG.moveTo(aSize, -aSize);
      arrowG.lineTo(-aSize, 0);
      arrowG.lineTo(aSize, aSize);
    }
    arrowG.closePath();
    arrowG.fill({ color: 0xffffff, alpha: 0.5 });

    container.addChild(g);
    container.addChild(arrowG);

    const rotationMap = {
      [Direction.Up]: -Math.PI / 2,
      [Direction.Right]: 0,
      [Direction.Down]: Math.PI / 2,
      [Direction.Left]: Math.PI,
    };
    container.rotation = rotationMap[direction];
    container.position.set(size / 2, size / 2);

    return container;
  }
}
