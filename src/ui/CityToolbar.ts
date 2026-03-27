/**
 * HTML-based bottom toolbar for city view.
 * Replaces the small "F" button with a full bar of city actions.
 */
export class CityToolbar {
  private bar: HTMLDivElement;
  private visible = false;

  onFleetToggle: (() => void) | null = null;
  onMarketBoardToggle: (() => void) | null = null;
  onRecipeDictionaryToggle: (() => void) | null = null;

  constructor() {
    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', left: '50%',
      transform: 'translateX(-50%)',
      display: 'none', gap: '8px',
      background: '#0d1525', border: '1px solid #2d3548',
      borderRadius: '12px', padding: '8px 16px',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
      zIndex: '850',
      fontFamily: 'Inter, sans-serif',
    });

    this.bar.appendChild(this.createButton('Recipes', '#4dc9f6', () => this.onRecipeDictionaryToggle?.()));
    this.bar.appendChild(this.createButton('Trucks', '#a855f7', () => this.onFleetToggle?.()));
    this.bar.appendChild(this.createButton('Market', '#f4c542', () => this.onMarketBoardToggle?.()));

    document.body.appendChild(this.bar);
  }

  private createButton(label: string, accentColor: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: '#1c2541', color: '#e8e8e8', border: `1px solid ${accentColor}40`,
      borderRadius: '8px', padding: '8px 20px', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '12px', fontWeight: '700',
      letterSpacing: '1px', transition: 'all 0.15s ease',
    });
    btn.addEventListener('pointerenter', () => {
      btn.style.background = accentColor + '30';
      btn.style.borderColor = accentColor;
      btn.style.color = accentColor;
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.background = '#1c2541';
      btn.style.borderColor = accentColor + '40';
      btn.style.color = '#e8e8e8';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  show(): void {
    this.visible = true;
    this.bar.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.bar.style.display = 'none';
  }

  get isVisible(): boolean { return this.visible; }

  destroy(): void {
    this.bar.remove();
  }
}
