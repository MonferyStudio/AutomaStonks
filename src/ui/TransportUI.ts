import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { TransportManager } from '@/transport/TransportManager';
import { VEHICLE_TYPES } from '@/transport/VehicleType';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const ITEM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_PRIMARY,
});

const PANEL_WIDTH = 240;
const PANEL_PADDING = 14;

export class TransportUI {
  readonly container: Container;
  private contentContainer: Container;
  private transportManager: TransportManager;
  private visible = false;
  private bg: Graphics;

  constructor(transportManager: TransportManager) {
    this.transportManager = transportManager;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'TRANSPORT', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 28);
    this.container.addChild(this.contentContainer);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.rebuild();
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();

    const routes = this.transportManager.getRoutes();
    const vehicles = this.transportManager.getVehicles();
    let yOffset = 0;

    const summaryText = new Text({
      text: `Routes: ${routes.length}  Vehicles: ${vehicles.length}`,
      style: ITEM_STYLE,
    });
    this.contentContainer.addChild(summaryText);
    yOffset += 20;

    for (const route of routes) {
      const row = new Container();
      row.position.set(0, yOffset);

      const rowBg = new Graphics();
      rowBg.roundRect(0, 0, PANEL_WIDTH - PANEL_PADDING * 2, 30, 6);
      rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
      row.addChild(rowBg);

      const routeText = new Text({
        text: `${route.fromBuildingId} -> ${route.toBuildingId}`,
        style: new TextStyle({ fontFamily: 'DM Sans, sans-serif', fontSize: 9, fill: COLORS.TEXT_PRIMARY }),
      });
      routeText.position.set(8, 4);
      row.addChild(routeText);

      if (route.vehicle) {
        const stateText = new Text({
          text: route.vehicle.state.toUpperCase(),
          style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 8, fill: route.vehicle.type.color }),
        });
        stateText.anchor.set(1, 0);
        stateText.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 8, 4);
        row.addChild(stateText);
      }

      const distText = new Text({
        text: `dist: ${route.distance}`,
        style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 8, fill: COLORS.TEXT_DIM }),
      });
      distText.position.set(8, 16);
      row.addChild(distText);

      this.contentContainer.addChild(row);
      yOffset += 34;
    }

    const panelHeight = PANEL_PADDING * 2 + 28 + yOffset + 10;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  positionAt(screenWidth: number, screenHeight: number): void {
    this.container.position.set(10, screenHeight / 2);
  }
}
