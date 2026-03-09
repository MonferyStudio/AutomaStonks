import type { ISerializable } from '@/interfaces/ISerializable';

export interface SaveSlotInfo {
  slotId: string;
  name: string;
  timestamp: number;
  playtime: number; // seconds
}

const INDEX_KEY = 'automastonks_saves_index';
const SLOT_PREFIX = 'automastonks_slot_';

export class SaveManager {
  private slots: SaveSlotInfo[] = [];

  constructor() {
    this.loadIndex();
  }

  private loadIndex(): void {
    const raw = localStorage.getItem(INDEX_KEY);
    this.slots = raw ? JSON.parse(raw) : [];
  }

  private saveIndex(): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.slots));
  }

  getSlots(): readonly SaveSlotInfo[] {
    return this.slots;
  }

  hasSave(): boolean {
    return this.slots.length > 0;
  }

  save(slotId: string, name: string, serializables: Map<string, ISerializable>): void {
    const data: Record<string, unknown> = {};
    for (const [key, s] of serializables) {
      data[key] = s.serialize();
    }
    localStorage.setItem(SLOT_PREFIX + slotId, JSON.stringify(data));

    // Update or create slot info
    const existing = this.slots.find((s) => s.slotId === slotId);
    if (existing) {
      existing.timestamp = Date.now();
      existing.name = name;
    } else {
      this.slots.push({
        slotId,
        name,
        timestamp: Date.now(),
        playtime: 0,
      });
    }
    this.saveIndex();
  }

  load(slotId: string, serializables: Map<string, ISerializable>): boolean {
    const raw = localStorage.getItem(SLOT_PREFIX + slotId);
    if (!raw) return false;

    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, s] of serializables) {
      if (key in data) {
        s.deserialize(data[key]);
      }
    }
    return true;
  }

  deleteSlot(slotId: string): void {
    localStorage.removeItem(SLOT_PREFIX + slotId);
    this.slots = this.slots.filter((s) => s.slotId !== slotId);
    this.saveIndex();
  }

  /** Generate a unique slot ID */
  generateSlotId(): string {
    return `save_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Quick save to a dedicated slot */
  quickSave(serializables: Map<string, ISerializable>): void {
    this.save('quicksave', 'Quick Save', serializables);
  }

  hasQuickSave(): boolean {
    return this.slots.some((s) => s.slotId === 'quicksave');
  }
}
