import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { WorldMap, type WorldCity, type WorldConnection } from '@/world/WorldMap';
import { WorldRenderer } from '@/world/WorldRenderer';
import { CameraController } from '@/rendering/CameraController';
import { CITY_TYPES, type CityTypeDefinition } from '@/world/CityType';
import { Vector2 } from '@/utils/Vector2';
import { COLORS } from '@/utils/Constants';

export type WorldEditorTool = 'place_city' | 'delete_city' | 'connect' | 'select' | 'none';

export class WorldEditor {
  readonly container: Container;
  readonly camera: CameraController;
  readonly worldMap: WorldMap;
  private renderer: WorldRenderer;
  private worldContainer: Container;

  currentTool: WorldEditorTool = 'select';
  currentCityType: CityTypeDefinition = CITY_TYPES['forest'];
  private selectedCityId: string | null = null;
  private connectFromId: string | null = null;
  private nextCityIndex = 0;

  onChange: (() => void) | null = null;

  constructor(worldMap?: WorldMap) {
    this.worldMap = worldMap ?? new WorldMap();
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);
    this.camera = new CameraController(this.worldContainer);

    this.renderer = new WorldRenderer();
    this.worldContainer.addChild(this.renderer.container);
  }

  setTool(tool: WorldEditorTool): void {
    this.currentTool = tool;
    this.connectFromId = null;
    this.selectedCityId = null;
  }

  setCityType(typeId: string): void {
    const t = CITY_TYPES[typeId];
    if (t) this.currentCityType = t;
  }

  handleClick(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld(screenX, screenY);
    const existing = this.renderer.getCityAtPosition(world.x, world.y, this.worldMap);

    switch (this.currentTool) {
      case 'place_city': {
        if (existing) return;
        const city: WorldCity = {
          id: `city_${this.nextCityIndex++}`,
          name: `${this.currentCityType.name} ${this.nextCityIndex}`,
          position: new Vector2(Math.round(world.x), Math.round(world.y)),
          cityType: this.currentCityType,
          unlocked: true,
          unlockCost: 0,
        };
        this.worldMap.addCity(city);
        this.renderer.markDirty();
        this.onChange?.();
        break;
      }

      case 'connect': {
        if (!existing) return;
        if (!this.connectFromId) {
          this.connectFromId = existing.id;
        } else {
          if (this.connectFromId !== existing.id) {
            const fromCity = this.worldMap.getCity(this.connectFromId);
            if (fromCity) {
              const dist = fromCity.position.manhattanDistance(existing.position);
              const transportTypes = ['truck'];
              if (fromCity.cityType.hasRailway && existing.cityType.hasRailway) transportTypes.push('train');
              if (fromCity.cityType.hasPort && existing.cityType.hasPort) transportTypes.push('boat');
              if (fromCity.cityType.hasAirport && existing.cityType.hasAirport) transportTypes.push('plane');

              this.worldMap.addConnection({
                fromCityId: this.connectFromId,
                toCityId: existing.id,
                distance: Math.round(dist / 10),
                transportTypes,
              });
              this.renderer.markDirty();
              this.onChange?.();
            }
          }
          this.connectFromId = null;
        }
        break;
      }

      case 'select': {
        this.selectedCityId = existing?.id ?? null;
        break;
      }
    }
  }

  update(): void {
    this.renderer.render(this.worldMap);
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    this.camera.centerOn(400, 300, screenWidth, screenHeight);
  }

  getSelectedCity(): WorldCity | null {
    return this.selectedCityId ? this.worldMap.getCity(this.selectedCityId) ?? null : null;
  }

  exportData(): { cities: WorldCity[]; connections: WorldConnection[] } {
    return {
      cities: this.worldMap.getCities(),
      connections: this.worldMap.getConnections(),
    };
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
