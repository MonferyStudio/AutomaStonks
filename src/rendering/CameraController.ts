import { Container } from 'pixi.js';

const DRAG_THRESHOLD = 5; // pixels of movement before it counts as a drag

export class CameraController {
  private container: Container;
  private _zoom = 1;
  private _x = 0;
  private _y = 0;
  private minZoom = 0.5;
  private maxZoom = 1.8;
  private isDragging = false;
  private wasDragged = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private boundHandlers: { canvas: HTMLCanvasElement; abort: AbortController } | null = null;
  dragEnabled = true;

  constructor(container: Container) {
    this.container = container;
  }

  get zoom(): number {
    return this._zoom;
  }

  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }

  setZoom(zoom: number): void {
    this._zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.applyTransform();
  }

  setPosition(x: number, y: number): void {
    this._x = x;
    this._y = y;
    this.applyTransform();
  }

  zoomAt(delta: number, screenX: number, screenY: number): void {
    const factor = delta > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this._zoom * factor));

    const worldX = (screenX - this._x) / this._zoom;
    const worldY = (screenY - this._y) / this._zoom;

    this._zoom = newZoom;
    this._x = screenX - worldX * this._zoom;
    this._y = screenY - worldY * this._zoom;

    this.applyTransform();
  }

  onPointerDown(x: number, y: number): void {
    if (!this.dragEnabled) return;
    this.isDragging = true;
    this.wasDragged = false;
    this.dragStartX = x;
    this.dragStartY = y;
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  onPointerMove(x: number, y: number): void {
    if (!this.isDragging) return;

    // Check if we've moved enough to count as a drag
    const totalDx = x - this.dragStartX;
    const totalDy = y - this.dragStartY;
    if (!this.wasDragged) {
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        this.wasDragged = true;
        // Snap camera to current total offset (skip the threshold gap)
        this._x += totalDx;
        this._y += totalDy;
        this.lastPointerX = x;
        this.lastPointerY = y;
        this.applyTransform();
      }
      return;
    }

    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    this._x += dx;
    this._y += dy;
    this.lastPointerX = x;
    this.lastPointerY = y;

    this.applyTransform();
  }

  onPointerUp(): void {
    this.isDragging = false;
  }

  /** Returns true if the last pointer interaction was a drag (not just a click) */
  get didDrag(): boolean {
    return this.wasDragged;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this._x) / this._zoom,
      y: (screenY - this._y) / this._zoom,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this._zoom + this._x,
      y: worldY * this._zoom + this._y,
    };
  }

  centerOn(worldX: number, worldY: number, screenWidth: number, screenHeight: number): void {
    this._x = screenWidth / 2 - worldX * this._zoom;
    this._y = screenHeight / 2 - worldY * this._zoom;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.container.position.set(this._x, this._y);
    this.container.scale.set(this._zoom);
  }

  bindToCanvas(canvas: HTMLCanvasElement): void {
    // Remove previous bindings first
    this.unbindFromCanvas();

    const abort = new AbortController();
    const signal = abort.signal;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.deltaY, e.offsetX, e.offsetY);
    }, { passive: false, signal });

    // Left-click drag to pan
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.onPointerDown(e.offsetX, e.offsetY);
      }
    }, { signal });

    canvas.addEventListener('pointermove', (e) => {
      this.onPointerMove(e.offsetX, e.offsetY);
    }, { signal });

    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 0) {
        this.onPointerUp();
      }
    }, { signal });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

    this.boundHandlers = { canvas, abort };
  }

  unbindFromCanvas(): void {
    if (this.boundHandlers) {
      this.boundHandlers.abort.abort();
      this.boundHandlers = null;
    }
    this.isDragging = false;
    this.wasDragged = false;
  }
}
