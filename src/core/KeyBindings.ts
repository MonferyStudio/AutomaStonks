export interface KeyAction {
  id: string;
  label: string;
  key: string;
  category: 'general' | 'factory' | 'panels';
}

const DEFAULT_BINDINGS: KeyAction[] = [
  // General
  { id: 'menu', label: 'Close / Back', key: 'Escape', category: 'general' },
  { id: 'back', label: 'Back One Level', key: 'Tab', category: 'general' },
  { id: 'save', label: 'Quick Save', key: 'F5', category: 'general' },

  // Panels
  { id: 'recipe_book', label: 'Recipe Book', key: 'b', category: 'panels' },
  { id: 'market', label: 'Market', key: 'm', category: 'panels' },
  { id: 'quests', label: 'Quests', key: 'q', category: 'panels' },
  { id: 'stats', label: 'Statistics', key: 's', category: 'panels' },
  { id: 'help', label: 'Show Controls', key: 'F1', category: 'panels' },

  // Factory
  { id: 'tool_belt', label: 'Belt Tool', key: '1', category: 'factory' },
  { id: 'tool_machine', label: 'Machine Tool', key: '2', category: 'factory' },
  { id: 'tool_io', label: 'I/O Port Tool', key: '3', category: 'factory' },
  { id: 'tool_delete', label: 'Delete Tool', key: '4', category: 'factory' },
  { id: 'rotate', label: 'Rotate', key: 'r', category: 'factory' },
  { id: 'undo', label: 'Undo', key: 'z', category: 'factory' },
  { id: 'redo', label: 'Redo', key: 'y', category: 'factory' },
];

const STORAGE_KEY = 'automastonks_keybindings';

export class KeyBindings {
  private bindings: KeyAction[];
  private byId = new Map<string, KeyAction>();
  private byKey = new Map<string, KeyAction>();

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const savedMap = JSON.parse(saved) as Record<string, string>;
      this.bindings = DEFAULT_BINDINGS.map((b) => ({
        ...b,
        key: savedMap[b.id] ?? b.key,
      }));
    } else {
      this.bindings = DEFAULT_BINDINGS.map((b) => ({ ...b }));
    }
    this.rebuildMaps();
  }

  private rebuildMaps(): void {
    this.byId.clear();
    this.byKey.clear();
    for (const b of this.bindings) {
      this.byId.set(b.id, b);
      this.byKey.set(b.key.toLowerCase(), b);
    }
  }

  getAll(): readonly KeyAction[] {
    return this.bindings;
  }

  getByCategory(category: KeyAction['category']): KeyAction[] {
    return this.bindings.filter((b) => b.category === category);
  }

  getKey(actionId: string): string {
    return this.byId.get(actionId)?.key ?? '';
  }

  getAction(key: string): string | null {
    // Try exact match first, then case-insensitive
    const action = this.byKey.get(key) ?? this.byKey.get(key.toLowerCase());
    return action?.id ?? null;
  }

  /** Returns true if the given key matches the given action */
  matches(key: string, actionId: string): boolean {
    const binding = this.byId.get(actionId);
    if (!binding) return false;
    return key === binding.key || key.toLowerCase() === binding.key.toLowerCase();
  }

  rebind(actionId: string, newKey: string): void {
    const binding = this.byId.get(actionId);
    if (!binding) return;

    // Remove old key mapping
    for (const [k, v] of this.byKey) {
      if (v.id === actionId) {
        this.byKey.delete(k);
        break;
      }
    }

    binding.key = newKey;
    this.rebuildMaps();
    this.save();
  }

  resetDefaults(): void {
    this.bindings = DEFAULT_BINDINGS.map((b) => ({ ...b }));
    this.rebuildMaps();
    localStorage.removeItem(STORAGE_KEY);
  }

  private save(): void {
    const data: Record<string, string> = {};
    for (const b of this.bindings) {
      data[b.id] = b.key;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /** Formats a key for display */
  static formatKey(key: string): string {
    switch (key) {
      case 'Escape': return 'ESC';
      case ' ': return 'SPACE';
      case 'ArrowUp': return 'UP';
      case 'ArrowDown': return 'DOWN';
      case 'ArrowLeft': return 'LEFT';
      case 'ArrowRight': return 'RIGHT';
      default:
        return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
    }
  }
}
