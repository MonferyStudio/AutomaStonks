import { Container } from 'pixi.js';

const DRAG_THRESHOLD = 5; // pixels of movement before it counts as a drag

export interface CameraBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

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

  /** Called on every pointermove with screen coords (even when not dragging) */
  onHoverMove: ((screenX: number, screenY: number) => void) | null = null;

  /** World-space bounds that the camera is clamped to */
  bounds: CameraBounds | null = null;
  /** Screen dimensions (needed for bounds clamping) */
  private screenW = 0;
  private screenH = 0;

  // Pinch-to-zoom state
  private activeTouches = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private isPinching = false;

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
    this.clampToBounds();
    this.container.position.set(this._x, this._y);
    this.container.scale.set(this._zoom);
  }

  private clampToBounds(): void {
    if (!this.bounds) return;
    const b = this.bounds;
    const z = this._zoom;
    // World rect in screen space
    const minX = -(b.x + b.w) * z + this.screenW;
    const maxX = -b.x * z;
    const minY = -(b.y + b.h) * z + this.screenH;
    const maxY = -b.y * z;
    if (minX < maxX) {
      this._x = Math.max(minX, Math.min(maxX, this._x));
    } else {
      // Bounds smaller than screen: center
      this._x = (minX + maxX) / 2;
    }
    if (minY < maxY) {
      this._y = Math.max(minY, Math.min(maxY, this._y));
    } else {
      this._y = (minY + maxY) / 2;
    }
  }

  setScreenSize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  setZoomLimits(min: number, max: number): void {
    this.minZoom = min;
    this.maxZoom = max;
    // Re-clamp current zoom
    this._zoom = Math.max(min, Math.min(max, this._zoom));
    this.applyTransform();
  }

  /** Zoom smoothly by a factor centered on screen point */
  zoomByFactor(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this._zoom * factor));
    const worldX = (screenX - this._x) / this._zoom;
    const worldY = (screenY - this._y) / this._zoom;
    this._zoom = newZoom;
    this._x = screenX - worldX * this._zoom;
    this._y = screenY - worldY * this._zoom;
    this.applyTransform();
  }

  private getTouchDist(): number {
    const pts = [...this.activeTouches.values()];
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getTouchCenter(): { x: number; y: number } {
    const pts = [...this.activeTouches.values()];
    if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  bindToCanvas(canvas: HTMLCanvasElement): void {
    // Remove previous bindings first
    this.unbindFromCanvas();
    this.screenW = canvas.clientWidth;
    this.screenH = canvas.clientHeight;

    const abort = new AbortController();
    const signal = abort.signal;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.deltaY, e.offsetX, e.offsetY);
    }, { passive: false, signal });

    // --- Pointer events (handles both mouse and touch) ---
    canvas.addEventListener('pointerdown', (e) => {
      this.activeTouches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

      if (this.activeTouches.size === 2) {
        // Start pinch
        this.isPinching = true;
        this.isDragging = false;
        this.pinchStartDist = this.getTouchDist();
        this.pinchStartZoom = this._zoom;
      } else if (this.activeTouches.size === 1 && e.button === 0) {
        this.onPointerDown(e.offsetX, e.offsetY);
      }
    }, { signal });

    canvas.addEventListener('pointermove', (e) => {
      this.activeTouches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

      if (this.isPinching && this.activeTouches.size >= 2) {
        const dist = this.getTouchDist();
        if (this.pinchStartDist > 0) {
          const factor = dist / this.pinchStartDist;
          const center = this.getTouchCenter();
          const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.pinchStartZoom * factor));
          const worldX = (center.x - this._x) / this._zoom;
          const worldY = (center.y - this._y) / this._zoom;
          this._zoom = newZoom;
          this._x = center.x - worldX * this._zoom;
          this._y = center.y - worldY * this._zoom;
          this.applyTransform();
        }
      } else if (!this.isPinching) {
        this.onPointerMove(e.offsetX, e.offsetY);
      }
      // Always fire hover callback (even during drag) for UI hover effects
      this.onHoverMove?.(e.offsetX, e.offsetY);
    }, { signal });

    canvas.addEventListener('pointerup', (e) => {
      this.activeTouches.delete(e.pointerId);
      if (this.isPinching) {
        if (this.activeTouches.size < 2) {
          this.isPinching = false;
          // If one finger remains, start panning from its position
          if (this.activeTouches.size === 1) {
            const remaining = [...this.activeTouches.values()][0];
            this.onPointerDown(remaining.x, remaining.y);
          }
        }
      } else if (e.button === 0) {
        this.onPointerUp();
      }
    }, { signal });

    canvas.addEventListener('pointercancel', (e) => {
      this.activeTouches.delete(e.pointerId);
      if (this.activeTouches.size < 2) this.isPinching = false;
      if (this.activeTouches.size === 0) this.onPointerUp();
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
    this.isPinching = false;
    this.activeTouches.clear();
  }
}
