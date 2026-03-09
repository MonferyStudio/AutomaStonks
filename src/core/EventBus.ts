export interface GameEvents {
  ItemProduced: { factoryId: string; recipeId: string; itemId: string; quantity: number };
  ItemSold: { shopId: string; itemId: string; revenue: number };
  RecipeDiscovered: { recipeId: string };
  LayoutChanged: { factoryId: string; layoutVersion: number };
  TickCompleted: { tickNumber: number };
  ViewChanged: { from: ViewType; to: ViewType };
  QuestCompleted: { questId: string; reward: number };
  MoneyChanged: { currency: 'coins' | 'talent'; oldAmount: number; newAmount: number };
  FactoryEntered: { factoryId: string };
  FactoryExited: { factoryId: string };
  EntityPlaced: { entityId: string; x: number; y: number };
  EntityRemoved: { entityId: string; x: number; y: number };
  StorageUpdated: { storageId: string };
}

export type ViewType = 'world' | 'city' | 'factory';

type EventCallback<T> = (data: T) => void;

interface WeakListener<T> {
  ref: WeakRef<object>;
  callback: EventCallback<T>;
}

type Listener<T> = EventCallback<T> | WeakListener<T>;

function isWeakListener<T>(listener: Listener<T>): listener is WeakListener<T> {
  return typeof listener === 'object' && 'ref' in listener;
}

class EventBusImpl {
  private listeners = new Map<string, Listener<never>[]>();

  on<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): () => void {
    const list = this.getOrCreateList(event);
    list.push(callback as Listener<never>);
    return () => this.off(event, callback);
  }

  onWeak<K extends keyof GameEvents>(
    event: K,
    owner: object,
    callback: EventCallback<GameEvents[K]>,
  ): void {
    const list = this.getOrCreateList(event);
    const weak: WeakListener<GameEvents[K]> = { ref: new WeakRef(owner), callback };
    list.push(weak as Listener<never>);
  }

  off<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex(
      (l) => (isWeakListener(l) ? l.callback === callback : l === callback),
    );
    if (idx !== -1) list.splice(idx, 1);
  }

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;

    let needsCleanup = false;
    for (const listener of list) {
      if (isWeakListener(listener)) {
        if (listener.ref.deref()) {
          (listener.callback as EventCallback<GameEvents[K]>)(data);
        } else {
          needsCleanup = true;
        }
      } else {
        (listener as unknown as EventCallback<GameEvents[K]>)(data);
      }
    }

    if (needsCleanup) {
      const cleaned = list.filter(
        (l) => !isWeakListener(l) || l.ref.deref() !== undefined,
      );
      this.listeners.set(event, cleaned);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  private getOrCreateList(event: string): Listener<never>[] {
    let list = this.listeners.get(event);
    if (!list) {
      list = [];
      this.listeners.set(event, list);
    }
    return list;
  }
}

export const eventBus = new EventBusImpl();
