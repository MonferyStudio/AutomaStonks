import type { ISerializable } from '@/interfaces/ISerializable';
import type { Wallet } from './Wallet';

export interface TalentNodeDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  branch: 'production' | 'commerce' | 'logistics' | 'economy';
  prerequisites: string[];
  effects: TalentEffect[];
}

export interface TalentEffect {
  type: 'unlock_recipe_pack' | 'sell_bonus' | 'belt_speed' | 'factory_size' | 'cost_reduction' | 'io_slots';
  target?: string;
  value: number;
}

export class TalentTree implements ISerializable<string[]> {
  private nodes = new Map<string, TalentNodeDefinition>();
  private unlocked = new Set<string>();
  private wallet: Wallet;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
  }

  loadNodes(defs: TalentNodeDefinition[]): void {
    for (const def of defs) {
      this.nodes.set(def.id, def);
    }
  }

  canUnlock(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    if (this.unlocked.has(nodeId)) return false;
    if (!this.wallet.canAfford(node.cost)) return false;

    for (const prereq of node.prerequisites) {
      if (!this.unlocked.has(prereq)) return false;
    }
    return true;
  }

  unlock(nodeId: string): boolean {
    if (!this.canUnlock(nodeId)) return false;
    const node = this.nodes.get(nodeId)!;
    if (!this.wallet.spendTalent(node.cost)) return false;
    this.unlocked.add(nodeId);
    return true;
  }

  isUnlocked(nodeId: string): boolean {
    return this.unlocked.has(nodeId);
  }

  getEffects(): TalentEffect[] {
    const effects: TalentEffect[] = [];
    for (const id of this.unlocked) {
      const node = this.nodes.get(id);
      if (node) effects.push(...node.effects);
    }
    return effects;
  }

  getEffectValue(type: TalentEffect['type'], target?: string): number {
    let total = 0;
    for (const effect of this.getEffects()) {
      if (effect.type === type) {
        if (!target || !effect.target || effect.target === target) {
          total += effect.value;
        }
      }
    }
    return total;
  }

  getAllNodes(): TalentNodeDefinition[] {
    return [...this.nodes.values()];
  }

  getNodesByBranch(branch: TalentNodeDefinition['branch']): TalentNodeDefinition[] {
    return [...this.nodes.values()].filter((n) => n.branch === branch);
  }

  serialize(): string[] {
    return [...this.unlocked];
  }

  deserialize(data: string[]): void {
    this.unlocked.clear();
    for (const id of data) {
      this.unlocked.add(id);
    }
  }
}
