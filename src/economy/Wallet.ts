import type { ISerializable } from '@/interfaces/ISerializable';
import { eventBus } from '@/core/EventBus';

export class Wallet implements ISerializable<{ coins: number; talent: number }> {
  private _coins: number;
  private _talent: number;

  constructor(initialCoins: number = 100, initialTalent: number = 0) {
    this._coins = initialCoins;
    this._talent = initialTalent;
  }

  get coins(): number {
    return this._coins;
  }

  get talent(): number {
    return this._talent;
  }

  addCoins(amount: number): void {
    const old = this._coins;
    this._coins += amount;
    eventBus.emit('MoneyChanged', { currency: 'coins', oldAmount: old, newAmount: this._coins });
  }

  spendCoins(amount: number): boolean {
    if (this._coins < amount) return false;
    const old = this._coins;
    this._coins -= amount;
    eventBus.emit('MoneyChanged', { currency: 'coins', oldAmount: old, newAmount: this._coins });
    return true;
  }

  addTalent(amount: number): void {
    const old = this._talent;
    this._talent += amount;
    eventBus.emit('MoneyChanged', { currency: 'talent', oldAmount: old, newAmount: this._talent });
  }

  spendTalent(amount: number): boolean {
    if (this._talent < amount) return false;
    const old = this._talent;
    this._talent -= amount;
    eventBus.emit('MoneyChanged', { currency: 'talent', oldAmount: old, newAmount: this._talent });
    return true;
  }

  reset(initialCoins: number = 100, initialTalent: number = 0): void {
    this._coins = initialCoins;
    this._talent = initialTalent;
    eventBus.emit('MoneyChanged', { currency: 'coins', oldAmount: 0, newAmount: this._coins });
  }

  canAfford(coins: number): boolean {
    return this._coins >= coins;
  }

  serialize(): { coins: number; talent: number } {
    return { coins: this._coins, talent: this._talent };
  }

  deserialize(data: { coins: number; talent: number }): void {
    this._coins = data.coins;
    this._talent = data.talent;
    eventBus.emit('MoneyChanged', { currency: 'coins', oldAmount: 0, newAmount: this._coins });
  }
}
