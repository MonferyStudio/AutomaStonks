import { Container, Graphics } from 'pixi.js';
import { RoadNetwork } from '@/city/RoadNetwork';
import { CitySlot } from '@/city/CitySlot';
import { CityNode } from '@/city/CityNode';
import { CityRenderer } from '@/city/CityRenderer';
import { CameraController } from '@/rendering/CameraController';
import { Polyomino } from '@/simulation/Polyomino';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import { Vector2 } from '@/utils/Vector2';
import { CELL_SIZE_PX, COLORS } from '@/utils/Constants';
import type { CityLayout } from '@/city/CityGenerator';

export type CityEditorTool = 'road' | 'delete_road' | 'factory_slot' | 'shop_slot' | 'decoration' | 'none';

const DEFAULT_WIDTH = 18;
const DEFAULT_HEIGHT = 12;

export class CityEditor {
  readonly container: Container;
  readonly camera: CameraController;
  private renderer: CityRenderer;
  private worldContainer: Container;
  private polyRegistry: PolyominoRegistry;

  roadNetwork: RoadNetwork;
  factorySlots: CitySlot[] = [];
  shopSlots: CitySlot[] = [];
  decorations: CityNode[] = [];

  currentTool: CityEditorTool = 'none';
  currentPolyominoId: string = 'tet_T';
  private ghostGraphic: Graphics;
  private width: number;
  private height: number;

  onChange: (() => void) | null = null;

  constructor(polyRegistry: PolyominoRegistry, layout?: CityLayout) {
    this.polyRegistry = polyRegistry;
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);
    this.camera = new CameraController(this.worldContainer);

    if (layout) {
      this.roadNetwork = layout.roadNetwork;
      this.factorySlots = layout.factorySlots;
      this.shopSlots = layout.shopSlots;
      this.decorations = layout.decorations;
      this.width = layout.width;
      this.height = layout.height;
    } else {
      this.width = DEFAULT_WIDTH;
      this.height = DEFAULT_HEIGHT;
      this.roadNetwork = new RoadNetwork(this.width, this.height);
    }

    this.renderer = new CityRenderer(polyRegistry);
    this.worldContainer.addChild(this.renderer.container);

    this.ghostGraphic = new Graphics();
    this.ghostGraphic.zIndex = 10;
    this.worldContainer.addChild(this.ghostGraphic);
  }

  setTool(tool: CityEditorTool): void {
    this.currentTool = tool;
  }

  handleClick(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);
    const pos = new Vector2(gridX, gridY);

    switch (this.currentTool) {
      case 'road':
        this.roadNetwork.addRoad(pos);
        this.renderer.markDirty();
        this.onChange?.();
        break;

      case 'delete_road':
        this.roadNetwork.removeRoad(pos);
        this.renderer.markDirty();
        this.onChange?.();
        break;

      case 'factory_slot': {
        const poly = this.polyRegistry.get(this.currentPolyominoId);
        if (!poly) break;
        const slot = new CitySlot('factory', pos, this.currentPolyominoId, poly, 100);
        this.factorySlots.push(slot);
        this.renderer.markDirty();
        this.onChange?.();
        break;
      }

      case 'shop_slot': {
        const shopPoly = this.polyRegistry.get('dom_I');
        if (!shopPoly) break;
        const slot = new CitySlot('shop', pos, 'dom_I', shopPoly, 40);
        this.shopSlots.push(slot);
        this.renderer.markDirty();
        this.onChange?.();
        break;
      }

      case 'decoration': {
        const mono = new Polyomino([new Vector2(0, 0)]);
        const node = new CityNode('decoration', pos, mono, 'mono_1', 'Tree', 0x2d5a27);
        this.decorations.push(node);
        this.renderer.markDirty();
        this.onChange?.();
        break;
      }
    }
  }

  handlePointerMove(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);

    this.ghostGraphic.clear();
    if (this.currentTool !== 'none') {
      const px = gridX * CELL_SIZE_PX;
      const py = gridY * CELL_SIZE_PX;
      this.ghostGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
      this.ghostGraphic.fill({ color: 0xffffff, alpha: 0.15 });
    }
  }

  update(): void {
    this.renderer.render(
      { roadNetwork: this.roadNetwork, factorySlots: this.factorySlots, shopSlots: this.shopSlots, storageSlots: [], decorations: this.decorations, width: this.width, height: this.height },
      this.factorySlots,
      this.shopSlots,
      [],
      [],
    );
  }

  exportLayout(): CityLayout {
    return {
      roadNetwork: this.roadNetwork,
      factorySlots: this.factorySlots,
      shopSlots: this.shopSlots,
      storageSlots: [],
      decorations: this.decorations,
      width: this.width,
      height: this.height,
    };
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    const centerX = (this.width * CELL_SIZE_PX) / 2;
    const centerY = (this.height * CELL_SIZE_PX) / 2;
    this.camera.centerOn(centerX, centerY, screenWidth, screenHeight);
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
