import type { RecipeDefinition } from '@/simulation/Recipe';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry, ResourceDefinition, ResourceMaterial } from '@/simulation/Resource';
import type { Machine } from '@/simulation/Machine';
import { makeItemVisual } from './itemVisual';
import { makeCloseButton } from './closeButton';
import { isMobile } from '@/utils/platform';
import { getXPManager } from '@/economy/XPManager';
import type { RecipeBook } from '@/simulation/RecipeBook';

const MATERIAL_LABELS: Record<string, string> = {
  wood: 'Wood', stone: 'Stone', metal: 'Metal',
  organic: 'Organic', food: 'Food', fluid: 'Fluid', misc: 'Misc',
};

const MATERIAL_COLORS: Record<string, string> = {
  wood: '#8B5E3C', stone: '#A0968C', metal: '#9696A0',
  organic: '#6abf69', food: '#53d769', fluid: '#4dc9f6', misc: '#8892a4',
};

export class AssemblerUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;

  private machine: Machine | null = null;
  private recipeRegistry: RecipeRegistry | null = null;
  private resourceRegistry: ResourceRegistry | null = null;
  private recipeBook: RecipeBook | null = null;
  private searchQuery = '';
  private activeFilter: string | null = null;

  /** Called when the player selects a recipe */
  onRecipeSelected: ((machine: Machine, recipeId: string | null) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.4)', zIndex: '960', display: 'none',
    });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(560px, calc(100vw - 24px))', maxHeight: 'min(85vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      zIndex: '961',
    });

    this.contentDiv = document.createElement('div');
    Object.assign(this.contentDiv.style, {
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      maxHeight: 'inherit', borderRadius: 'inherit',
    });
    this.panel.appendChild(this.contentDiv);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
  }

  show(machine: Machine, recipeRegistry: RecipeRegistry, resourceRegistry: ResourceRegistry, recipeBook?: RecipeBook): void {
    this.machine = machine;
    this.recipeRegistry = recipeRegistry;
    this.resourceRegistry = resourceRegistry;
    this.recipeBook = recipeBook ?? null;
    this.searchQuery = '';
    this.activeFilter = null;
    this.overlay.style.display = 'block';
    this.rebuild();
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.machine = null;
  }

  get isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  private rebuild(): void {
    this.contentDiv.innerHTML = '';
    if (!this.machine || !this.recipeRegistry || !this.resourceRegistry) return;

    // Header
    const header = this.el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '10px 10px 0 0', flexShrink: '0',
    });
    header.appendChild(this.el('span', { fontWeight: '700', letterSpacing: '1px', fontSize: '13px' }, 'ASSEMBLER — SELECT RECIPE'));
    header.appendChild(makeCloseButton(() => this.hide()));
    this.contentDiv.appendChild(header);

    // Current recipe indicator
    if (this.machine.selectedRecipeId) {
      const current = this.recipeRegistry.get(this.machine.selectedRecipeId);
      if (current) {
        const bar = this.el('div', {
          padding: '8px 14px', background: 'rgba(83,215,105,0.1)',
          borderBottom: '1px solid #2d3548',
          display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0',
        });
        bar.appendChild(this.el('span', { fontSize: '10px', color: '#53d769', fontWeight: '600' }, 'Current:'));
        bar.appendChild(this.el('span', { fontSize: '11px' }, this.getRecipeLabel(current)));

        const clearBtn = this.el('button', {
          marginLeft: 'auto', background: 'rgba(233,69,96,0.2)',
          border: '1px solid rgba(233,69,96,0.4)', borderRadius: '4px',
          color: '#e94560', cursor: 'pointer', padding: '2px 8px',
          fontSize: '10px', fontFamily: 'inherit',
        }, 'Clear');
        clearBtn.addEventListener('click', () => {
          this.selectRecipe(null);
        });
        bar.appendChild(clearBtn);
        this.contentDiv.appendChild(bar);
      }
    }

    // Search bar
    const searchRow = this.el('div', { padding: '8px 14px', flexShrink: '0' });
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search recipes...';
    searchInput.value = this.searchQuery;
    Object.assign(searchInput.style, {
      width: '100%', padding: '6px 10px', background: '#0d1525',
      border: '1px solid #2d3548', borderRadius: '6px', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '11px', outline: 'none',
      boxSizing: 'border-box',
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.rebuildList();
    });
    searchRow.appendChild(searchInput);
    this.contentDiv.appendChild(searchRow);

    // Material filter tabs — based on output item materials
    const filterRow = this.el('div', {
      display: 'flex', gap: '4px', padding: '0 14px 8px', flexWrap: 'wrap', flexShrink: '0',
    });
    const materials = this.getOutputMaterials();
    filterRow.appendChild(this.makeFilterTab('All', null));
    for (const mat of materials) {
      const label = MATERIAL_LABELS[mat] ?? mat;
      filterRow.appendChild(this.makeFilterTab(label, mat));
    }
    this.contentDiv.appendChild(filterRow);

    // Recipe list (scrollable)
    const listContainer = this.el('div', {
      overflowY: 'auto', padding: '0 14px 12px', flex: '1',
    });
    listContainer.id = 'assembler-recipe-list';
    this.contentDiv.appendChild(listContainer);
    this.rebuildList();

    if (!isMobile()) {
      requestAnimationFrame(() => searchInput.focus());
    }
  }

  private rebuildList(): void {
    const container = this.contentDiv.querySelector('#assembler-recipe-list');
    if (!container || !this.recipeRegistry || !this.resourceRegistry) return;
    container.innerHTML = '';

    const recipes = this.recipeRegistry.getByMachineType('assemble');
    let filtered = recipes;

    // Filter by output material
    if (this.activeFilter) {
      filtered = filtered.filter(r => {
        const outRes = this.resourceRegistry!.get(r.outputs[0]?.resourceId);
        return outRes?.material === this.activeFilter;
      });
    }

    // Search filter
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        const outRes = this.resourceRegistry!.get(r.outputs[0]?.resourceId);
        if (outRes && outRes.name.toLowerCase().includes(q)) return true;
        // Also search input names
        for (const inp of r.inputs) {
          const inRes = this.resourceRegistry!.get(inp.resourceId);
          if (inRes && inRes.name.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    // Sort alphabetically by output name
    filtered.sort((a, b) => {
      const aName = this.resourceRegistry!.get(a.outputs[0]?.resourceId)?.name ?? '';
      const bName = this.resourceRegistry!.get(b.outputs[0]?.resourceId)?.name ?? '';
      return aName.localeCompare(bName);
    });

    if (filtered.length === 0) {
      container.appendChild(this.el('div', {
        color: '#555', padding: '20px', textAlign: 'center',
      }, 'No recipes found'));
      return;
    }

    for (const recipe of filtered) {
      container.appendChild(this.makeRecipeCard(recipe));
    }
  }

  private makeRecipeCard(recipe: RecipeDefinition): HTMLElement {
    const isSelected = this.machine?.selectedRecipeId === recipe.id;
    const outputRes = this.resourceRegistry!.get(recipe.outputs[0]?.resourceId);
    const discovered = this.recipeBook ? this.recipeBook.isDiscovered(recipe.id) : true;
    const xp = getXPManager();
    const levelLocked = xp ? !xp.isUnlocked(recipe.requiredLevel ?? 0) : false;
    const locked = !discovered || levelLocked;

    const card = this.el('div', {
      background: isSelected ? 'rgba(83,215,105,0.12)' : 'rgba(28,37,65,0.6)',
      border: isSelected ? '1px solid rgba(83,215,105,0.5)' : '1px solid rgba(45,53,72,0.5)',
      borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
      cursor: locked ? 'default' : 'pointer',
      transition: 'border-color 0.15s, background 0.15s',
      opacity: locked ? '0.35' : '1',
    });

    if (!locked) {
      card.addEventListener('pointerenter', () => {
        if (!isSelected) card.style.borderColor = 'rgba(77,201,246,0.4)';
      });
      card.addEventListener('pointerleave', () => {
        card.style.borderColor = isSelected ? 'rgba(83,215,105,0.5)' : 'rgba(45,53,72,0.5)';
      });
      card.addEventListener('click', () => {
        this.selectRecipe(recipe.id);
      });
    }

    // Top row: output icon + name + selected badge
    const topRow = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
    });

    if (locked) {
      // Mystery placeholder
      const placeholder = this.el('div', {
        width: '28px', height: '28px', borderRadius: '50%',
        background: '#333', flexShrink: '0',
      });
      topRow.appendChild(placeholder);
      const label = levelLocked ? `\uD83D\uDD12 Level ${recipe.requiredLevel} required` : '\uD83D\uDD12 ???';
      topRow.appendChild(this.el('span', {
        fontWeight: '600', fontSize: '11px', color: '#555', fontStyle: 'italic',
      }, label));
    } else if (outputRes) {
      topRow.appendChild(makeItemVisual(outputRes, 28));
      topRow.appendChild(this.el('span', {
        fontWeight: '700', fontSize: '12px',
      }, outputRes.name));
    }

    if (isSelected) {
      topRow.appendChild(this.el('span', {
        marginLeft: 'auto', fontSize: '9px', color: '#53d769',
        fontWeight: '700', background: 'rgba(83,215,105,0.2)',
        padding: '2px 6px', borderRadius: '4px',
      }, '\u2713 ACTIVE'));
    }

    card.appendChild(topRow);

    // Skip inputs row for locked recipes
    if (locked) return card;

    // Inputs row: icons + quantities
    const inputsRow = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
    });

    for (let i = 0; i < recipe.inputs.length; i++) {
      const inp = recipe.inputs[i];
      const inRes = this.resourceRegistry!.get(inp.resourceId);
      if (!inRes) continue;

      if (i > 0) {
        inputsRow.appendChild(this.el('span', { color: '#555', fontSize: '10px', margin: '0 2px' }, '+'));
      }

      const inputItem = this.el('div', {
        display: 'flex', alignItems: 'center', gap: '3px',
        background: 'rgba(13,21,37,0.6)', borderRadius: '4px', padding: '3px 6px',
      });
      inputItem.appendChild(makeItemVisual(inRes, 18));
      const label = inp.quantity > 1 ? `${inRes.name} x${inp.quantity}` : inRes.name;
      inputItem.appendChild(this.el('span', { fontSize: '10px', color: '#aab' }, label));
      inputsRow.appendChild(inputItem);
    }

    // Arrow
    inputsRow.appendChild(this.el('span', { color: '#4dc9f6', fontSize: '12px', margin: '0 4px' }, '\u2192'));

    // Output quantity
    const outQty = recipe.outputs[0]?.quantity ?? 1;
    if (outputRes) {
      const outputItem = this.el('div', {
        display: 'flex', alignItems: 'center', gap: '3px',
        background: 'rgba(83,215,105,0.1)', borderRadius: '4px', padding: '3px 6px',
      });
      outputItem.appendChild(makeItemVisual(outputRes, 18));
      const outLabel = outQty > 1 ? `${outputRes.name} x${outQty}` : outputRes.name;
      outputItem.appendChild(this.el('span', { fontSize: '10px', color: '#53d769' }, outLabel));
      inputsRow.appendChild(outputItem);
    }

    card.appendChild(inputsRow);
    return card;
  }

  private selectRecipe(recipeId: string | null): void {
    if (!this.machine) return;
    this.machine.selectedRecipeId = recipeId;
    this.onRecipeSelected?.(this.machine, recipeId);
    this.rebuild();
  }

  private getRecipeLabel(recipe: RecipeDefinition): string {
    const outRes = this.resourceRegistry?.get(recipe.outputs[0]?.resourceId);
    return outRes?.name ?? recipe.id;
  }

  private getOutputMaterials(): string[] {
    if (!this.recipeRegistry || !this.resourceRegistry) return [];
    const recipes = this.recipeRegistry.getByMachineType('assemble');
    const mats = new Set<string>();
    for (const r of recipes) {
      const outRes = this.resourceRegistry.get(r.outputs[0]?.resourceId);
      if (outRes?.material) mats.add(outRes.material);
    }
    return [...mats].sort();
  }

  private makeFilterTab(label: string, material: string | null): HTMLElement {
    const active = this.activeFilter === material;
    const color = material ? (MATERIAL_COLORS[material] ?? '#8892a4') : '#8892a4';
    const tab = this.el('button', {
      padding: '3px 8px', borderRadius: '4px', fontSize: '9px',
      fontFamily: 'inherit', cursor: 'pointer',
      background: active ? color : 'transparent',
      color: active ? '#fff' : color,
      border: `1px solid ${active ? color : 'rgba(136,146,164,0.3)'}`,
      fontWeight: active ? '700' : '400',
      transition: 'all 0.15s',
    }, label);
    tab.addEventListener('click', () => {
      this.activeFilter = material;
      this.rebuild();
    });
    return tab;
  }

  private el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  destroy(): void {
    this.overlay.remove();
  }
}
