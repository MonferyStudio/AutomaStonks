import type { ResourceDefinition } from '@/simulation/Resource';
import { TextureCache } from '@/rendering/TextureCache';

/**
 * Create an HTML canvas element showing a resource item (sprite or fallback shape).
 * For pixel art: canvas is drawn at NATIVE sprite size, CSS scales to display size
 * with nearest-neighbor (image-rendering: pixelated) for crisp rendering.
 */
export function makeItemVisual(res: ResourceDefinition, displaySize: number): HTMLElement {
  // Try sprite first
  const tex = TextureCache.getItemTexture(res.id);
  if (tex) {
    const frame = tex.frame;
    const nw = Math.round(frame.width);
    const nh = Math.round(frame.height);

    const canvas = document.createElement('canvas');
    // Internal resolution = native sprite size (e.g. 16x16)
    canvas.width = nw;
    canvas.height = nh;
    // Display size = requested size via CSS (browser does nearest-neighbor upscale)
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    canvas.style.imageRendering = 'pixelated';

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const source = tex.source.resource as HTMLImageElement | HTMLCanvasElement;
    if (source) {
      ctx.drawImage(source, frame.x, frame.y, nw, nh, 0, 0, nw, nh);
    }
    return canvas;
  }

  // Fallback: draw shape on canvas (vector, so draw at display size directly)
  const canvas = document.createElement('canvas');
  canvas.width = displaySize;
  canvas.height = displaySize;
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;
  const ctx = canvas.getContext('2d')!;
  const colorHex = '#' + res.color.toString(16).padStart(6, '0');
  ctx.fillStyle = colorHex;
  const cx = displaySize / 2;
  const cy = displaySize / 2;
  const half = displaySize * 0.35;

  switch (res.shape) {
    case 'square':
      roundRect(ctx, cx - half, cy - half, half * 2, half * 2, half * 0.3);
      ctx.fill();
      break;
    case 'rect':
      roundRect(ctx, cx - half * 1.3, cy - half * 0.6, half * 2.6, half * 1.2, half * 0.25);
      ctx.fill();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cloud':
      ctx.beginPath();
      ctx.arc(cx - half * 0.3, cy, half * 0.5, 0, Math.PI * 2);
      ctx.arc(cx + half * 0.3, cy - half * 0.2, half * 0.4, 0, Math.PI * 2);
      ctx.arc(cx + half * 0.1, cy + half * 0.3, half * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      ctx.fill();
  }
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
