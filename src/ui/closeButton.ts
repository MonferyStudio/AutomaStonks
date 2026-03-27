/**
 * Creates a styled close button (red X in a rounded square).
 * Used across all closeable panels for consistent UX.
 */
export function makeCloseButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = '\u2715'; // ✕
  Object.assign(btn.style, {
    width: '36px', height: '36px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(233,69,96,0.2)',
    border: '1px solid rgba(233,69,96,0.4)',
    borderRadius: '8px',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    fontFamily: 'inherit',
    lineHeight: '1',
    padding: '0',
    transition: 'background 0.15s',
    flexShrink: '0',
  } as Partial<CSSStyleDeclaration>);
  btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(233,69,96,0.4)'; });
  btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(233,69,96,0.2)'; });
  btn.addEventListener('click', onClick);
  return btn;
}
