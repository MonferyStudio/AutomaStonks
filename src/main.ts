import { Application } from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/rendering/TextureCache';

async function init(): Promise<void> {
  const app = new Application();

  // Wait for fonts to load before initializing canvas text
  await document.fonts.ready;

  await app.init({
    background: 0x0f1f33,
    resizeTo: window,
    antialias: true,
    roundPixels: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Load sprite textures
  await TextureCache.loadTextures();

  document.body.appendChild(app.canvas as HTMLCanvasElement);

  const game = new Game(app);

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS);
  });
}

init().catch(console.error);
