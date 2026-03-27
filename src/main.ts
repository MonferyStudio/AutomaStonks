import { Application } from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/rendering/TextureCache';
import { isMobile } from '@/utils/platform';

async function init(): Promise<void> {
  const app = new Application();

  // Wait for fonts to load before initializing canvas text
  await document.fonts.ready;

  // Cap resolution on mobile to avoid excessive GPU memory usage
  const dpr = window.devicePixelRatio || 1;
  const resolution = isMobile() ? Math.min(dpr, 2) : dpr;

  await app.init({
    background: 0x1a1a2e,
    resizeTo: window,
    antialias: !isMobile(), // Disable antialiasing on mobile for performance
    roundPixels: true,
    resolution,
    autoDensity: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });

  // Load sprite textures
  await TextureCache.loadTextures();

  const canvas = app.canvas as HTMLCanvasElement;
  document.body.appendChild(canvas);

  const game = new Game(app);

  // --- WebGL context loss handling ---
  // When context is lost, ALL GPU resources (textures, shaders, buffers) are destroyed.
  // Pixi.js cannot fully recover from this — textures won't re-upload, text disappears, etc.
  // The most reliable strategy: save immediately, then reload the page on restore.

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    app.ticker.stop();
    game.forceSave(); // Save before we lose anything
    console.warn('[WebGL] Context lost — saved & paused');
  });

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('[WebGL] Context restored — reloading page');
    window.location.reload();
  });

  // Pause rendering when tab is hidden to reduce chances of context loss
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS);
  });
}

init().catch(console.error);
