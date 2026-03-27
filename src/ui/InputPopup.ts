/**
 * Lightweight modal input popup — replaces browser prompt() for cross-platform support.
 * Supports text input and optional quick-action buttons.
 */

export interface InputPopupOptions {
  title: string;
  placeholder?: string;
  value?: string;
  /** Max character length for input */
  maxLength?: number;
  /** Input type: 'text' or 'number' */
  inputType?: 'text' | 'number';
  /** Quick-action buttons shown above the input (e.g. "All" to fill a value) */
  quickActions?: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

export class InputPopup {
  private overlay: HTMLDivElement | null = null;

  show(opts: InputPopupOptions): void {
    this.hide(); // Close any existing popup

    // Overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(0,0,0,0.5)',
      zIndex: '990', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });
    this.overlay = overlay;

    // Card
    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(300px, calc(100vw - 32px))', background: '#16213e',
      border: '1px solid #2d3548', borderRadius: '10px',
      color: '#e8e8e8', fontFamily: 'Inter, sans-serif',
      fontSize: '12px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    });

    // Title
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '10px 14px', background: '#0d1525',
      borderBottom: '1px solid #2d3548',
      fontWeight: '700', letterSpacing: '1px', fontSize: '11px',
    });
    header.textContent = opts.title;
    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.style.padding = '14px';

    // Quick action buttons
    if (opts.quickActions && opts.quickActions.length > 0) {
      const actionRow = document.createElement('div');
      Object.assign(actionRow.style, {
        display: 'flex', gap: '6px', marginBottom: '10px',
      });
      for (const action of opts.quickActions) {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        Object.assign(btn.style, {
          flex: '1', padding: '6px 0',
          background: 'rgba(77,201,246,0.2)', border: '1px solid rgba(77,201,246,0.3)',
          borderRadius: '6px', color: '#4dc9f6',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', fontWeight: '600',
        });
        btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(77,201,246,0.35)'; });
        btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(77,201,246,0.2)'; });
        btn.addEventListener('click', () => { input.value = action.value; input.focus(); });
        actionRow.appendChild(btn);
      }
      body.appendChild(actionRow);
    }

    // Input
    const input = document.createElement('input');
    input.type = opts.inputType ?? 'text';
    input.placeholder = opts.placeholder ?? '';
    input.value = opts.value ?? '';
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.inputType === 'number') { input.min = '0'; input.max = '999999'; }
    Object.assign(input.style, {
      width: '100%', padding: '8px 10px',
      background: '#0d1525', border: '1px solid #2d3548',
      borderRadius: '6px', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '12px',
      outline: 'none', boxSizing: 'border-box',
    });
    input.addEventListener('focus', () => { input.style.borderColor = '#4dc9f6'; });
    input.addEventListener('blur', () => { input.style.borderColor = '#2d3548'; });
    body.appendChild(input);

    // Button row
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex', gap: '8px', marginTop: '12px',
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';
    Object.assign(cancelBtn.style, {
      flex: '1', padding: '8px 0',
      background: 'rgba(136,146,164,0.15)', border: 'none',
      borderRadius: '6px', color: '#8892a4',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', fontWeight: '600',
    });
    cancelBtn.addEventListener('click', () => {
      this.hide();
      opts.onCancel?.();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = opts.confirmLabel ?? 'Confirm';
    Object.assign(confirmBtn.style, {
      flex: '1', padding: '8px 0',
      background: 'rgba(83,215,105,0.35)', border: 'none',
      borderRadius: '6px', color: '#e8e8e8',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', fontWeight: '700',
    });
    confirmBtn.addEventListener('click', () => {
      this.hide();
      opts.onConfirm(input.value);
    });

    btnRow.append(cancelBtn, confirmBtn);
    body.appendChild(btnRow);
    card.appendChild(body);
    overlay.appendChild(card);

    // Close on overlay click (outside card)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hide();
        opts.onCancel?.();
      }
    });

    // Enter to confirm, Escape to cancel
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.hide(); opts.onConfirm(input.value); }
      if (e.key === 'Escape') { this.hide(); opts.onCancel?.(); }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  hide(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
}
