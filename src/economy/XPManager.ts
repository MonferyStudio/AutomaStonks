import type { ISerializable } from '@/interfaces/ISerializable';
import { eventBus } from '@/core/EventBus';

export interface XPSaveData {
  totalXP: number;
}

/** Global singleton reference for UI access. */
let _instance: XPManager | null = null;

export function getXPManager(): XPManager | null {
  return _instance;
}

export class XPManager implements ISerializable<XPSaveData> {
  private _totalXP = 0;
  private _currentLevel = 0;

  /** Cumulative XP thresholds per level. Level N requires thresholds[N] total XP. */
  private thresholds: number[] = [];

  constructor() {
    this.buildThresholds(30);
    this.setupListeners();
    _instance = this;
  }

  private buildThresholds(maxLevel: number): void {
    this.thresholds = [0]; // Level 0 = 0 XP
    let cumulative = 0;
    for (let i = 1; i <= maxLevel; i++) {
      cumulative += Math.floor(100 * Math.pow(1.5, i - 1));
      this.thresholds.push(cumulative);
    }
  }

  private setupListeners(): void {
    eventBus.on('ItemSold', (data) => {
      if (data.revenue > 0) this.addXP(Math.floor(data.revenue), 'sale');
    });
    eventBus.on('RecipeDiscovered', () => {
      this.addXP(50, 'discovery');
    });
    eventBus.on('QuestCompleted', (data) => {
      this.addXP(data.reward * 10, 'quest');
    });
  }

  get totalXP(): number { return this._totalXP; }
  get currentLevel(): number { return this._currentLevel; }

  /** XP earned within the current level (for progress bar). */
  get xpInCurrentLevel(): number {
    const base = this.thresholds[this._currentLevel] ?? 0;
    return this._totalXP - base;
  }

  /** Total XP needed to go from current level to next level. */
  get xpForNextLevel(): number {
    const cur = this.thresholds[this._currentLevel] ?? 0;
    const next = this.thresholds[this._currentLevel + 1];
    if (next === undefined) return 1; // Max level
    return next - cur;
  }

  /** Progress ratio 0-1 within current level. */
  get progress(): number {
    const needed = this.xpForNextLevel;
    if (needed <= 0) return 1;
    return Math.min(1, this.xpInCurrentLevel / needed);
  }

  addXP(amount: number, source: string): void {
    if (amount <= 0) return;
    this._totalXP += amount;

    const oldLevel = this._currentLevel;
    this.recalculateLevel();

    eventBus.emit('XPGained', { amount, newTotal: this._totalXP, source });

    if (this._currentLevel !== oldLevel) {
      eventBus.emit('LevelChanged', { oldLevel, newLevel: this._currentLevel });
    }
  }

  isUnlocked(requiredLevel: number): boolean {
    return this._currentLevel >= requiredLevel;
  }

  reset(): void {
    this._totalXP = 0;
    this._currentLevel = 0;
  }

  private recalculateLevel(): void {
    let level = 0;
    for (let i = 1; i < this.thresholds.length; i++) {
      if (this._totalXP >= this.thresholds[i]) {
        level = i;
      } else {
        break;
      }
    }
    this._currentLevel = level;
  }

  serialize(): XPSaveData {
    return { totalXP: this._totalXP };
  }

  deserialize(data: XPSaveData): void {
    this._totalXP = data.totalXP ?? 0;
    this.recalculateLevel();
    // Notify UIs of restored state
    eventBus.emit('XPGained', { amount: 0, newTotal: this._totalXP, source: 'restore' });
    if (this._currentLevel > 0) {
      eventBus.emit('LevelChanged', { oldLevel: 0, newLevel: this._currentLevel });
    }
  }
}
