import { eventBus } from '@/core/EventBus';

export type NotificationType = 'warning' | 'info' | 'success';

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  element: HTMLDivElement;
  timer: ReturnType<typeof setTimeout>;
}

const DISPLAY_DURATION = 5000;
const FADE_DURATION = 400;
const MAX_VISIBLE = 5;

let nextId = 0;

export class NotificationSystem {
  private container: HTMLDivElement;
  private notifications: Notification[] = [];

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '60px',
      right: '12px',
      zIndex: '1000',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
      fontFamily: 'Inter, sans-serif',
    });
    document.body.appendChild(this.container);
  }

  push(type: NotificationType, message: string): void {
    // Deduplicate: if same message already showing, skip
    if (this.notifications.some(n => n.message === message)) return;

    // Evict oldest if at max
    while (this.notifications.length >= MAX_VISIBLE) {
      this.dismiss(this.notifications[0].id);
    }

    const id = nextId++;
    const el = this.createElement(type, message);
    this.container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    const timer = setTimeout(() => this.dismiss(id), DISPLAY_DURATION);
    this.notifications.push({ id, type, message, element: el, timer });
  }

  private dismiss(id: number): void {
    const idx = this.notifications.findIndex(n => n.id === id);
    if (idx < 0) return;
    const notif = this.notifications[idx];
    clearTimeout(notif.timer);
    notif.element.style.opacity = '0';
    notif.element.style.transform = 'translateX(60px)';
    setTimeout(() => {
      notif.element.remove();
    }, FADE_DURATION);
    this.notifications.splice(idx, 1);
  }

  private createElement(type: NotificationType, message: string): HTMLDivElement {
    const colors: Record<NotificationType, { bg: string; border: string; icon: string }> = {
      warning: { bg: 'rgba(249, 200, 66, 0.12)', border: '#f5c842', icon: '⚠' },
      info: { bg: 'rgba(77, 201, 246, 0.12)', border: '#4dc9f6', icon: 'ℹ' },
      success: { bg: 'rgba(83, 215, 105, 0.12)', border: '#53d769', icon: '✓' },
    };
    const c = colors[type];

    const el = document.createElement('div');
    Object.assign(el.style, {
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '6px',
      padding: '8px 14px',
      color: '#e8e8e8',
      fontSize: '11px',
      lineHeight: '1.4',
      backdropFilter: 'blur(8px)',
      opacity: '0',
      transform: 'translateX(60px)',
      transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
      maxWidth: '280px',
      pointerEvents: 'auto',
      cursor: 'pointer',
    });
    el.textContent = `${c.icon}  ${message}`;

    // Click to dismiss
    el.addEventListener('click', () => {
      const notif = this.notifications.find(n => n.element === el);
      if (notif) this.dismiss(notif.id);
    });

    return el;
  }

  destroy(): void {
    for (const n of this.notifications) {
      clearTimeout(n.timer);
    }
    this.notifications = [];
    this.container.remove();
  }
}
