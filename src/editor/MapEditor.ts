import { Container } from 'pixi.js';
import { WorldEditor } from './WorldEditor';
import { CityEditor } from './CityEditor';
import { EditorUI } from './EditorUI';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import type { WorldMap } from '@/world/WorldMap';

export type EditorMode = 'world' | 'city';

export class MapEditor {
  readonly container: Container;
  private worldEditor: WorldEditor;
  private cityEditor: CityEditor | null = null;
  private editorUI: EditorUI;
  private polyRegistry: PolyominoRegistry;
  private currentMode: EditorMode = 'world';

  constructor(polyRegistry: PolyominoRegistry, worldMap?: WorldMap) {
    this.polyRegistry = polyRegistry;
    this.container = new Container();

    this.worldEditor = new WorldEditor(worldMap);
    this.container.addChild(this.worldEditor.container);

    this.editorUI = new EditorUI(
      (tool) => {
        if (this.currentMode === 'world') {
          this.worldEditor.setTool(tool as any);
        } else if (this.cityEditor) {
          this.cityEditor.setTool(tool as any);
        }
      },
      () => this.switchMode(),
    );
    this.container.addChild(this.editorUI.container);
  }

  switchMode(): void {
    if (this.currentMode === 'world') {
      this.currentMode = 'city';
      this.worldEditor.container.visible = false;

      this.cityEditor = new CityEditor(this.polyRegistry);
      this.container.addChild(this.cityEditor.container);
      this.editorUI.setMode('city');
    } else {
      this.currentMode = 'world';
      if (this.cityEditor) {
        this.cityEditor.destroy();
        this.cityEditor = null;
      }
      this.worldEditor.container.visible = true;
      this.editorUI.setMode('world');
    }
  }

  handleClick(screenX: number, screenY: number): void {
    if (this.currentMode === 'world') {
      this.worldEditor.handleClick(screenX, screenY);
    } else {
      this.cityEditor?.handleClick(screenX, screenY);
    }
  }

  handlePointerMove(screenX: number, screenY: number): void {
    if (this.currentMode === 'city') {
      this.cityEditor?.handlePointerMove(screenX, screenY);
    }
  }

  update(): void {
    if (this.currentMode === 'world') {
      this.worldEditor.update();
    } else {
      this.cityEditor?.update();
    }
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    this.worldEditor.centerCamera(screenWidth, screenHeight);
    this.cityEditor?.centerCamera(screenWidth, screenHeight);
  }

  get mode(): EditorMode {
    return this.currentMode;
  }

  destroy(): void {
    this.worldEditor.destroy();
    this.cityEditor?.destroy();
    this.container.destroy({ children: true });
  }
}
