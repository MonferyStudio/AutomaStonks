import { Container, Text, TextStyle } from 'pixi.js';
import { FONT_MONO } from '@/utils/Constants';
import { formatMoney } from '@/utils/currency';
import { textResolution } from '@/utils/platform';

interface FloatingText {
  text: Text;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** Pending amount to batch before spawning */
interface PendingBatch {
  amount: number;
  color: number;
  worldX: number;
  worldY: number;
  timer: number;
}

const BATCH_WINDOW_MS = 500; // accumulate sales within 500ms

/**
 * Manages floating text popups in world-space (e.g. "+$120" when selling).
 * Batches rapid-fire events at the same position into a single text.
 */
export class FloatingTextManager {
  readonly container: Container;
  private active: FloatingText[] = [];
  private pending = new Map<string, PendingBatch>();

  constructor() {
    this.container = new Container();
    this.container.zIndex = 10;
  }

  /** Queue a floating number — batched by position+color within a time window */
  spawn(worldX: number, worldY: number, amount: number, color: number): void {
    const key = `${Math.round(worldX)}_${Math.round(worldY)}_${color}`;
    const existing = this.pending.get(key);
    if (existing) {
      existing.amount += amount;
      existing.timer = BATCH_WINDOW_MS;
    } else {
      this.pending.set(key, {
        amount,
        color,
        worldX,
        worldY,
        timer: BATCH_WINDOW_MS,
      });
    }
  }

  private emitText(worldX: number, worldY: number, amount: number, color: number): void {
    const prefix = amount >= 0 ? '+' : '-';
    const label = `${prefix}${formatMoney(Math.abs(amount))}`;

    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: FONT_MONO,
        fontSize: 12,
        fontWeight: '700',
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      }),
      resolution: textResolution(),
    });
    text.anchor.set(0.5);
    text.position.set(worldX, worldY);

    this.container.addChild(text);
    this.active.push({
      text,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -1.2,
      life: 1200,
      maxLife: 1200,
    });
  }

  update(deltaMs: number): void {
    // Flush batched pending texts
    for (const [key, batch] of this.pending) {
      batch.timer -= deltaMs;
      if (batch.timer <= 0) {
        this.emitText(batch.worldX, batch.worldY, batch.amount, batch.color);
        this.pending.delete(key);
      }
    }

    // Animate active texts
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ft = this.active[i];
      ft.life -= deltaMs;
      ft.text.x += ft.vx * (deltaMs / 16);
      ft.text.y += ft.vy * (deltaMs / 16);
      ft.vy *= 0.98;

      const fadeStart = 400;
      if (ft.life < fadeStart) {
        ft.text.alpha = Math.max(0, ft.life / fadeStart);
      }

      if (ft.life <= 0) {
        this.container.removeChild(ft.text);
        ft.text.destroy();
        this.active.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const ft of this.active) {
      ft.text.destroy();
    }
    this.active.length = 0;
    this.pending.clear();
    this.container.destroy({ children: true });
  }
}
