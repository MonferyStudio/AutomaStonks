import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS, FONT_UI } from '@/utils/Constants';
import type { Truck } from '@/transport/Truck';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import type { ResourceRegistry } from '@/simulation/Resource';
import { textResolution } from '@/utils/platform';

const LABEL_STYLE = new TextStyle({
  fontFamily: FONT_UI,
  fontSize: 13,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const BODY_STYLE = new TextStyle({
  fontFamily: FONT_UI,
  fontSize: 11,
  fill: COLORS.TEXT_PRIMARY,
  wordWrap: true,
  wordWrapWidth: 220,
  lineHeight: 18,
});

export class TruckTooltip {
  readonly container: Container;
  private truck: Truck | null = null;
  private resourceRegistry: ResourceRegistry;

  constructor(resourceRegistry: ResourceRegistry) {
    this.resourceRegistry = resourceRegistry;
    this.container = new Container();
    this.container.zIndex = 200;
    this.container.visible = false;
  }

  show(truck: Truck, screenX: number, screenY: number, screenWidth: number, screenHeight: number): void {
    this.truck = truck;
    this.container.removeChildren().forEach(c => c.destroy({ children: true }));

    const pad = 12;
    const gap = 6;

    // State
    const stateMap: Record<string, string> = {
      idle: 'Idle', loading: 'Loading', moving_to_dest: 'Delivering',
      unloading: 'Unloading', moving_to_origin: 'Returning',
    };

    // Build lines with clear sections
    const lines: string[] = [];
    lines.push(`State:  ${stateMap[truck.state] ?? truck.state}`);
    lines.push(`Speed:  ${truck.speed.toFixed(1)}  cells/tick`);
    const cargoWeight = truck.cargo.reduce((sum, c) => {
      const w = this.resourceRegistry.get(c.resourceId)?.storageWeight ?? 1;
      return sum + c.quantity * w;
    }, 0);
    lines.push(`Cap:    ${cargoWeight} / ${truck.maxCargo}`);
    lines.push(`Load:   ${truck.loadTicks} ticks/item`);

    // Title
    const title = new Text({
      text: truck.name || `Truck #${truck.index + 1}`,
      style: new TextStyle({
        fontFamily: FONT_UI, fontSize: 14, fontWeight: '700',
        fill: COLORS.ACCENT_YELLOW,
      }),
      resolution: textResolution(),
    });
    title.position.set(pad, pad);

    // Separator line under title
    const sepY = pad + title.height + gap;

    const body = new Text({ text: lines.join('\n'), style: BODY_STYLE, resolution: textResolution() });
    body.position.set(pad, sepY + 4);

    // Cargo section with sprites
    const cargoContainer = new Container();
    let cargoY = sepY + 4 + body.height + gap;

    const cargoLabel = new Text({
      text: truck.cargo.length > 0 ? 'Cargo:' : 'Cargo:  empty',
      style: BODY_STYLE, resolution: textResolution(),
    });
    cargoLabel.position.set(pad, cargoY);
    cargoContainer.addChild(cargoLabel);
    cargoY += cargoLabel.height + 4;

    let maxCargoW = cargoLabel.width;
    if (truck.cargo.length > 0) {
      for (const item of truck.cargo) {
        const def = this.resourceRegistry.get(item.resourceId);
        if (!def) continue;

        const icon = SpriteFactory.createItemIcon(def, 16);
        icon.position.set(pad + 4, cargoY);
        cargoContainer.addChild(icon);

        const itemText = new Text({
          text: `${def.name}  x${item.quantity}`,
          style: BODY_STYLE, resolution: textResolution(),
        });
        itemText.position.set(pad + 24, cargoY);
        cargoContainer.addChild(itemText);
        maxCargoW = Math.max(maxCargoW, 24 + itemText.width);
        cargoY += 20;
      }
    }

    const minW = 200;
    const totalW = Math.max(minW, Math.max(title.width, body.width, maxCargoW) + pad * 2);
    const totalH = cargoY + pad;

    const bg = new Graphics();
    bg.roundRect(0, 0, totalW, totalH, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.ACCENT_YELLOW, width: 1.5, alpha: 0.5 });

    // Separator
    const sep = new Graphics();
    sep.moveTo(pad, sepY);
    sep.lineTo(totalW - pad, sepY);
    sep.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });

    this.container.addChild(bg, title, sep, body, cargoContainer);

    // Position — clamp to screen
    let px = screenX - totalW / 2;
    let py = screenY - totalH - 14;
    if (px + totalW > screenWidth - 8) px = screenWidth - totalW - 8;
    if (px < 8) px = 8;
    if (py < 8) py = screenY + 24;

    this.container.position.set(px, py);
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
    this.truck = null;
  }

  get isVisible(): boolean {
    return this.container.visible;
  }

  /** Returns true if the click was consumed */
  handleClick(_screenX: number, _screenY: number): boolean {
    if (!this.container.visible) return false;
    // Any click dismisses
    this.hide();
    return true;
  }
}
