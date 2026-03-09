import type { ISerializable } from '@/interfaces/ISerializable';
import { eventBus } from '@/core/EventBus';
import type { Wallet } from './Wallet';

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  condition: QuestCondition;
  reward: { talent: number; coins?: number };
}

export interface QuestCondition {
  type: 'produce' | 'sell' | 'discover' | 'earn';
  target?: string;
  amount: number;
}

export interface QuestProgress {
  questId: string;
  current: number;
  completed: boolean;
}

export class QuestManager implements ISerializable<QuestProgress[]> {
  private quests = new Map<string, QuestDefinition>();
  private progress = new Map<string, QuestProgress>();
  private wallet: Wallet;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
    this.setupListeners();
  }

  loadQuests(defs: QuestDefinition[]): void {
    for (const def of defs) {
      this.quests.set(def.id, def);
      if (!this.progress.has(def.id)) {
        this.progress.set(def.id, { questId: def.id, current: 0, completed: false });
      }
    }
  }

  private setupListeners(): void {
    eventBus.on('ItemProduced', (data) => {
      for (const [id, quest] of this.quests) {
        if (quest.condition.type !== 'produce') continue;
        if (quest.condition.target && quest.condition.target !== data.itemId) continue;
        this.incrementProgress(id, data.quantity);
      }
    });

    eventBus.on('ItemSold', (data) => {
      for (const [id, quest] of this.quests) {
        if (quest.condition.type === 'sell') {
          if (!quest.condition.target || quest.condition.target === data.itemId) {
            this.incrementProgress(id, 1);
          }
        }
        if (quest.condition.type === 'earn') {
          this.incrementProgress(id, data.revenue);
        }
      }
    });

    eventBus.on('RecipeDiscovered', () => {
      for (const [id, quest] of this.quests) {
        if (quest.condition.type === 'discover') {
          this.incrementProgress(id, 1);
        }
      }
    });
  }

  private incrementProgress(questId: string, amount: number): void {
    const prog = this.progress.get(questId);
    const quest = this.quests.get(questId);
    if (!prog || !quest || prog.completed) return;

    prog.current += amount;
    if (prog.current >= quest.condition.amount) {
      prog.completed = true;
      this.wallet.addTalent(quest.reward.talent);
      if (quest.reward.coins) this.wallet.addCoins(quest.reward.coins);
      eventBus.emit('QuestCompleted', { questId, reward: quest.reward.talent });
    }
  }

  getQuests(): Array<{ def: QuestDefinition; progress: QuestProgress }> {
    const result: Array<{ def: QuestDefinition; progress: QuestProgress }> = [];
    for (const [id, def] of this.quests) {
      const prog = this.progress.get(id)!;
      result.push({ def, progress: prog });
    }
    return result;
  }

  getActiveQuests(): Array<{ def: QuestDefinition; progress: QuestProgress }> {
    return this.getQuests().filter((q) => !q.progress.completed);
  }

  getCompletedQuests(): Array<{ def: QuestDefinition; progress: QuestProgress }> {
    return this.getQuests().filter((q) => q.progress.completed);
  }

  serialize(): QuestProgress[] {
    return [...this.progress.values()];
  }

  deserialize(data: QuestProgress[]): void {
    for (const prog of data) {
      this.progress.set(prog.questId, prog);
    }
  }
}
