import { Container } from 'pixi.js';
import { WorldRenderer } from './WorldRenderer';
import { WorldMap } from './WorldMap';
import { WorldGenerator, WORLD_WIDTH, WORLD_HEIGHT } from './WorldGenerator';
import { CameraController } from '@/rendering/CameraController';

export class WorldView {
  readonly container: Container;
  readonly camera: CameraController;
  readonly renderer: WorldRenderer;
  readonly worldMap: WorldMap;
  private worldContainer: Container;

  onCityClicked: ((cityId: string) => void) | null = null;

  constructor() {
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);
    this.camera = new CameraController(this.worldContainer);

    const generator = new WorldGenerator();
    const { worldMap, biomeMap } = generator.generate();
    this.worldMap = worldMap;

    this.renderer = new WorldRenderer();
    this.renderer.setBiomeMap(biomeMap);
    this.worldContainer.addChild(this.renderer.container);
  }

  handleClick(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld(screenX, screenY);
    const city = this.renderer.getCityAtPosition(world.x, world.y, this.worldMap);

    if (!city) return;

    if (city.unlocked) {
      this.onCityClicked?.(city.id);
    } else {
      // Unlock via progression: must be adjacent to an already-unlocked city
      if (this.isAdjacentToUnlocked(city.id)) {
        this.worldMap.unlockCity(city.id);
        this.renderer.markDirty();
      }
    }
  }

  /** Check if a city has a connection to any unlocked city */
  private isAdjacentToUnlocked(cityId: string): boolean {
    const connections = this.worldMap.getConnectionsForCity(cityId);
    for (const conn of connections) {
      const otherId = conn.fromCityId === cityId ? conn.toCityId : conn.fromCityId;
      const other = this.worldMap.getCity(otherId);
      if (other?.unlocked) return true;
    }
    return false;
  }

  update(_deltaMs?: number): void {
    this.renderer.render(this.worldMap);
  }

  /** Center camera on the starter city, zoomed in */
  centerCamera(screenWidth: number, screenHeight: number): void {
    const starter = this.worldMap.getCities().find((c) => c.unlocked);
    if (starter) {
      this.camera.setZoom(1.5);
      this.camera.centerOn(starter.position.x, starter.position.y, screenWidth, screenHeight);
    } else {
      this.camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, screenWidth, screenHeight);
    }
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
