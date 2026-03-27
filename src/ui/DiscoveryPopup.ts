import { eventBus } from '@/core/EventBus';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry } from '@/simulation/Resource';
import { makeItemVisual } from './itemVisual';

const XP_REWARD = 50;
const DISPLAY_DURATION = 3500;
const FADE_IN = 300;
const FADE_OUT = 500;

/**
 * Big centered popup shown when a new recipe is discovered.
 * Shows the output item sprite, name, and XP earned.
 */
export class DiscoveryPopup {
  private recipeRegistry: RecipeRegistry;
  private resourceRegistry: ResourceRegistry;
  private queue: string[] = [];
  private showing = false;

  constructor(recipeRegistry: RecipeRegistry, resourceRegistry: ResourceRegistry) {
    this.recipeRegistry = recipeRegistry;
    this.resourceRegistry = resourceRegistry;

    eventBus.on('RecipeDiscovered', ({ recipeId }) => {
      this.queue.push(recipeId);
      if (!this.showing) this.showNext();
    });
  }

  private showNext(): void {
    const recipeId = this.queue.shift();
    if (!recipeId) { this.showing = false; return; }

    const recipe = this.recipeRegistry.get(recipeId);
    if (!recipe) { this.showNext(); return; }

    const outputId = recipe.outputs[0]?.resourceId;
    const resDef = outputId ? this.resourceRegistry.get(outputId) : undefined;
    const itemName = resDef?.name ?? outputId ?? '???';

    this.showing = true;
    this.createPopup(resDef, itemName);
  }

  private createPopup(resDef: import('@/simulation/Resource').ResourceDefinition | undefined, itemName: string): void {
    // Overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '970', display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      opacity: '0', transition: `opacity ${FADE_IN}ms ease`,
    });

    // Card
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: 'radial-gradient(ellipse at center, #1c2541 0%, #16213e 100%)',
      border: '2px solid #4dc9f6',
      borderRadius: '16px',
      padding: '28px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      boxShadow: '0 0 60px rgba(77,201,246,0.3), 0 0 120px rgba(77,201,246,0.1)',
      fontFamily: 'Inter, sans-serif',
      transform: 'scale(0.7)',
      transition: `transform ${FADE_IN}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
      maxWidth: 'min(360px, calc(100vw - 48px))',
    });

    // Title
    const title = document.createElement('div');
    Object.assign(title.style, {
      fontSize: '11px', fontWeight: '700', letterSpacing: '3px',
      textTransform: 'uppercase', color: '#4dc9f6',
    });
    title.textContent = 'RECIPE DISCOVERED';
    card.appendChild(title);

    // Glow ring + item sprite
    const spriteWrap = document.createElement('div');
    Object.assign(spriteWrap.style, {
      width: '80px', height: '80px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(77,201,246,0.15) 0%, transparent 70%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 30px rgba(77,201,246,0.25)',
    });
    if (resDef) {
      const visual = makeItemVisual(resDef, 56);
      spriteWrap.appendChild(visual);
    } else {
      const placeholder = document.createElement('div');
      Object.assign(placeholder.style, {
        width: '56px', height: '56px', borderRadius: '50%', background: '#333',
      });
      spriteWrap.appendChild(placeholder);
    }
    card.appendChild(spriteWrap);

    // Item name
    const nameEl = document.createElement('div');
    Object.assign(nameEl.style, {
      fontSize: '20px', fontWeight: '800', color: '#e8e8e8',
      textAlign: 'center', letterSpacing: '0.5px',
    });
    nameEl.textContent = itemName;
    card.appendChild(nameEl);

    // XP earned
    const xpEl = document.createElement('div');
    Object.assign(xpEl.style, {
      fontSize: '14px', fontWeight: '700', color: '#f5c842',
      display: 'flex', alignItems: 'center', gap: '6px',
    });
    xpEl.textContent = `+${XP_REWARD} XP`;
    card.appendChild(xpEl);

    // Subtitle
    const sub = document.createElement('div');
    Object.assign(sub.style, {
      fontSize: '10px', color: '#8892a4', textAlign: 'center',
    });
    sub.textContent = 'This recipe is now available in the dictionary';
    card.appendChild(sub);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });

    // Click to dismiss early
    overlay.style.pointerEvents = 'auto';
    overlay.addEventListener('click', () => dismiss());

    // Auto-dismiss
    const timer = setTimeout(() => dismiss(), DISPLAY_DURATION);

    const dismiss = () => {
      clearTimeout(timer);
      overlay.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      card.style.transition = `transform ${FADE_OUT}ms ease`;
      overlay.style.transition = `opacity ${FADE_OUT}ms ease`;
      setTimeout(() => {
        overlay.remove();
        this.showNext();
      }, FADE_OUT);
    };
  }
}
