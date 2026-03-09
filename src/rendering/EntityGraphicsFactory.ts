import { Container, Graphics, Sprite } from 'pixi.js';
import { TextureCache } from './TextureCache';
import type { Belt } from '@/simulation/Belt';
import type { Splitter } from '@/simulation/Splitter';
import { Direction, directionToVector, oppositeDirection, rotateDirectionCW } from '@/utils/Direction';
import { CELL_SIZE_PX, COLORS } from '@/utils/Constants';

/**
 * Creates entity graphics (tunnels, belts, splitters) for the factory view.
 * Extracted from FactoryRenderer to follow SRP.
 */

export interface BeltSpriteResult {
  container: Container;
  sprite: Sprite | null;
  type: 'straight' | 'curve';
}

export function createTunnelGraphic(direction: Direction, isEntry: boolean): Container {
  const container = new Container();
  const S = CELL_SIZE_PX;
  const g = new Graphics();
  const color = 0x6b7db3;

  g.roundRect(2, 2, S - 4, S - 4, 4);
  g.fill({ color: 0x2a2a40, alpha: 0.9 });
  g.roundRect(2, 2, S - 4, S - 4, 4);
  g.stroke({ color, alpha: 0.5, width: 1.5 });

  const cx = S / 2;
  const cy = S / 2;

  if (isEntry) {
    g.rect(cx - 2, cy - 2, 4, 4);
    g.fill({ color, alpha: 0.6 });
  } else {
    g.circle(cx, cy, 3);
    g.fill({ color, alpha: 0.6 });
  }

  const aSize = 5;
  const rotMap = {
    [Direction.Up]: -Math.PI / 2,
    [Direction.Right]: 0,
    [Direction.Down]: Math.PI / 2,
    [Direction.Left]: Math.PI,
  };
  const arrow = new Graphics();
  arrow.moveTo(aSize, 0);
  arrow.lineTo(-aSize * 0.5, -aSize * 0.5);
  arrow.lineTo(-aSize * 0.5, aSize * 0.5);
  arrow.closePath();
  arrow.fill({ color, alpha: 0.4 });
  arrow.position.set(cx, cy);
  arrow.rotation = rotMap[direction];

  container.addChild(g, arrow);
  return container;
}

export function createSeamlessBeltGraphic(belt: Belt): BeltSpriteResult {
  const container = new Container();
  const S = CELL_SIZE_PX;
  const isStraight = belt.inputDirection === oppositeDirection(belt.direction);
  const type = isStraight ? 'straight' as const : 'curve' as const;

  const tex = isStraight
    ? TextureCache.beltStraightFrames[TextureCache.beltAnimFrame] ?? null
    : TextureCache.beltCurveFrames[TextureCache.beltAnimFrame] ?? null;

  if (tex) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(S / 2, S / 2);
    sprite.roundPixels = true;
    sprite.scale.set(2);

    if (isStraight) {
      const rotMap: Record<Direction, number> = {
        [Direction.Right]: 0,
        [Direction.Down]: Math.PI / 2,
        [Direction.Left]: Math.PI,
        [Direction.Up]: -Math.PI / 2,
      };
      sprite.rotation = rotMap[belt.direction];
    } else {
      const entryEdge = belt.inputDirection;
      const exitEdge = belt.direction;
      const curveKey = `${entryEdge}_${exitEdge}`;

      const normalRotations: Record<string, number> = {
        [`${Direction.Left}_${Direction.Down}`]: 0,
        [`${Direction.Down}_${Direction.Right}`]: -Math.PI / 2,
        [`${Direction.Right}_${Direction.Up}`]: Math.PI,
        [`${Direction.Up}_${Direction.Left}`]: Math.PI / 2,
      };

      const flippedRotations: Record<string, number> = {
        [`${Direction.Right}_${Direction.Down}`]: Math.PI,
        [`${Direction.Down}_${Direction.Left}`]: -Math.PI / 2,
        [`${Direction.Up}_${Direction.Right}`]: Math.PI / 2,
        [`${Direction.Left}_${Direction.Up}`]: 0,
      };

      if (normalRotations[curveKey] !== undefined) {
        sprite.rotation = normalRotations[curveKey];
      } else {
        sprite.scale.y *= -1;
        sprite.rotation = flippedRotations[curveKey] ?? 0;
      }
    }

    container.addChild(sprite);
    return { container, sprite, type };
  }

  // Fallback: simple colored rectangle
  const g = new Graphics();
  g.rect(2, 2, S - 4, S - 4);
  g.fill(COLORS.BELT);
  container.addChild(g);
  return { container, sprite: null, type };
}

export function createSplitterGraphic(splitter: Splitter): Container {
  const container = new Container();
  const S = CELL_SIZE_PX;
  const g = new Graphics();
  const color = 0xf7c948;
  const bgColor = 0x2a2a1e;

  const cells = splitter.getCells();
  const dir = splitter.direction;
  const dirVec = directionToVector(dir);
  const perpVec = directionToVector(rotateDirectionCW(dir));

  const minX = Math.min(cells[0].x, cells[1].x) * S;
  const minY = Math.min(cells[0].y, cells[1].y) * S;
  const maxX = Math.max(cells[0].x, cells[1].x) * S + S;
  const maxY = Math.max(cells[0].y, cells[1].y) * S + S;
  const pad = 2;

  g.roundRect(minX + pad, minY + pad, maxX - minX - pad * 2, maxY - minY - pad * 2, 5);
  g.fill({ color: bgColor, alpha: 0.9 });
  g.roundRect(minX + pad, minY + pad, maxX - minX - pad * 2, maxY - minY - pad * 2, 5);
  g.stroke({ color, alpha: 0.6, width: 1.5 });

  const c0x = cells[0].x * S + S / 2;
  const c0y = cells[0].y * S + S / 2;
  const c1x = cells[1].x * S + S / 2;
  const c1y = cells[1].y * S + S / 2;
  const midX = (c0x + c1x) / 2;
  const midY = (c0y + c1y) / 2;
  const divLen = S * 0.35;
  g.moveTo(midX - dirVec.x * divLen, midY - dirVec.y * divLen);
  g.lineTo(midX + dirVec.x * divLen, midY + dirVec.y * divLen);
  g.stroke({ color, alpha: 0.3, width: 1 });

  const a = 4;
  const inOff = 0.3;
  const outOff = 0.3;

  for (let i = 0; i < 2; i++) {
    const cell = cells[i];
    const cx = cell.x * S + S / 2;
    const cy = cell.y * S + S / 2;

    const inX = cx - dirVec.x * (S * inOff);
    const inY = cy - dirVec.y * (S * inOff);
    g.moveTo(inX + dirVec.x * a, inY + dirVec.y * a);
    g.lineTo(inX - dirVec.x * a + perpVec.x * a, inY - dirVec.y * a + perpVec.y * a);
    g.lineTo(inX - dirVec.x * a - perpVec.x * a, inY - dirVec.y * a - perpVec.y * a);
    g.closePath();
    g.fill({ color: 0x4dc9f6, alpha: 0.5 });

    const outX = cx + dirVec.x * (S * outOff);
    const outY = cy + dirVec.y * (S * outOff);
    g.moveTo(outX + dirVec.x * a, outY + dirVec.y * a);
    g.lineTo(outX - dirVec.x * a + perpVec.x * a, outY - dirVec.y * a + perpVec.y * a);
    g.lineTo(outX - dirVec.x * a - perpVec.x * a, outY - dirVec.y * a - perpVec.y * a);
    g.closePath();
    g.fill({ color, alpha: 0.6 });
  }

  const in0x = c0x - dirVec.x * (S * 0.15);
  const in0y = c0y - dirVec.y * (S * 0.15);
  const out1x = c1x + dirVec.x * (S * 0.15);
  const out1y = c1y + dirVec.y * (S * 0.15);
  g.moveTo(in0x, in0y);
  g.lineTo(out1x, out1y);
  g.stroke({ color, alpha: 0.2, width: 1.5 });

  const in1x = c1x - dirVec.x * (S * 0.15);
  const in1y = c1y - dirVec.y * (S * 0.15);
  const out0x = c0x + dirVec.x * (S * 0.15);
  const out0y = c0y + dirVec.y * (S * 0.15);
  g.moveTo(in1x, in1y);
  g.lineTo(out0x, out0y);
  g.stroke({ color, alpha: 0.2, width: 1.5 });

  container.addChild(g);
  return container;
}
