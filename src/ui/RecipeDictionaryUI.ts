import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { RecipeDefinition } from '@/simulation/Recipe';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import type { RecipeBook } from '@/simulation/RecipeBook';
import { makeCloseButton } from './closeButton';
import { makeItemVisual } from './itemVisual';
import { getXPManager } from '@/economy/XPManager';

/**
 * Recipe Dictionary — shows full crafting chains for all items.
 * Accessible from both city toolbar and factory view.
 */
export class RecipeDictionaryUI {
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private recipeRegistry: RecipeRegistry;
  private resourceRegistry: ResourceRegistry;
  private recipeBook: RecipeBook;
  private visible = false;

  /** Map: resourceId → recipe that produces it */
  private recipeByOutput = new Map<string, RecipeDefinition>();

  constructor(recipeRegistry: RecipeRegistry, resourceRegistry: ResourceRegistry, recipeBook?: RecipeBook) {
    this.recipeRegistry = recipeRegistry;
    this.resourceRegistry = resourceRegistry;
    this.recipeBook = recipeBook ?? { isDiscovered: () => true } as unknown as RecipeBook;
    this.buildRecipeIndex();

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(520px, calc(100vw - 24px))', maxHeight: 'min(85vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      display: 'none', zIndex: '950',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      flexDirection: 'column',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '8px 8px 0 0', flexShrink: '0',
    });
    const title = document.createElement('span');
    title.textContent = 'Recipe Dictionary';
    Object.assign(title.style, { fontWeight: '700', fontSize: '13px' });
    header.append(title, makeCloseButton(() => this.hide()));
    this.panel.appendChild(header);

    // Search bar
    const searchBar = document.createElement('div');
    Object.assign(searchBar.style, {
      padding: '8px 12px', borderBottom: '1px solid #2d3548', flexShrink: '0',
    });
    this.searchInput = document.createElement('input');
    this.searchInput.placeholder = 'Search items...';
    Object.assign(this.searchInput.style, {
      width: '100%', padding: '6px 10px',
      background: '#0d1525', border: '1px solid #2d3548',
      borderRadius: '6px', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '12px', outline: 'none',
    });
    this.searchInput.addEventListener('input', () => this.rebuild());
    searchBar.appendChild(this.searchInput);
    this.panel.appendChild(searchBar);

    // Content area
    this.contentDiv = document.createElement('div');
    Object.assign(this.contentDiv.style, {
      overflowY: 'auto', padding: '8px 12px', flex: '1',
    });
    this.panel.appendChild(this.contentDiv);

    document.body.appendChild(this.panel);
  }

  private buildRecipeIndex(): void {
    this.recipeByOutput.clear();
    for (const recipe of this.recipeRegistry.getAll()) {
      for (const out of recipe.outputs) {
        // First recipe wins (shouldn't have duplicates normally)
        if (!this.recipeByOutput.has(out.resourceId)) {
          this.recipeByOutput.set(out.resourceId, recipe);
        }
      }
    }
  }

  private getResourceName(id: string): string {
    const def = this.resourceRegistry.get(id);
    if (def) return def.name;
    // Fallback: convert snake_case to Title Case
    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private getResourceColor(id: string): string {
    const def = this.resourceRegistry.get(id);
    if (def) return '#' + def.color.toString(16).padStart(6, '0');
    return '#8892a4';
  }

  private getMachineName(operationType: string): string {
    const names: Record<string, string> = {
      cut: 'Cutter', press: 'Press', smelt: 'Smelter',
      assemble: 'Assembler', cook: 'Cooker', mix: 'Mixer',
      slice: 'Slicer', extract: 'Extractor',
    };
    return names[operationType] ?? operationType;
  }

  private getMachineColor(operationType: string): string {
    const colors: Record<string, string> = {
      cut: '#4dc9f6', press: '#a855f7', smelt: '#e94560',
      assemble: '#f5c842', cook: '#ff8c42', mix: '#53d769',
      slice: '#4dc9f6', extract: '#8892a4',
    };
    return colors[operationType] ?? '#8892a4';
  }

  /** Check if a resource is a raw material (no recipe produces it) */
  private isRawMaterial(resourceId: string): boolean {
    return !this.recipeByOutput.has(resourceId);
  }

  /** Get all unique output resource IDs sorted by tier then name */
  private getAllItems(): string[] {
    // Collect all resource IDs that appear as outputs
    const outputIds = new Set<string>();
    for (const recipe of this.recipeRegistry.getAll()) {
      for (const out of recipe.outputs) {
        outputIds.add(out.resourceId);
      }
    }

    // Also add raw materials that appear as inputs
    for (const recipe of this.recipeRegistry.getAll()) {
      for (const inp of recipe.inputs) {
        if (this.isRawMaterial(inp.resourceId)) {
          outputIds.add(inp.resourceId);
        }
      }
    }

    // Sort by tier, then by name
    return [...outputIds].sort((a, b) => {
      const defA = this.resourceRegistry.get(a);
      const defB = this.resourceRegistry.get(b);
      const tierA = defA?.tier ?? 99;
      const tierB = defB?.tier ?? 99;
      if (tierA !== tierB) return tierA - tierB;
      return this.getResourceName(a).localeCompare(this.getResourceName(b));
    });
  }

  private rebuild(): void {
    this.contentDiv.innerHTML = '';
    const filter = this.searchInput.value.toLowerCase().trim();
    const items = this.getAllItems();

    // Group by category
    const groups: { label: string; items: string[] }[] = [];
    const raw: string[] = [];
    const processed: string[] = [];
    const final: string[] = [];

    for (const id of items) {
      const name = this.getResourceName(id).toLowerCase();
      if (filter && !name.includes(filter) && !id.includes(filter)) continue;

      const def = this.resourceRegistry.get(id);
      if (this.isRawMaterial(id)) {
        raw.push(id);
      } else if (def && def.tier <= 1) {
        processed.push(id);
      } else {
        final.push(id);
      }
    }

    if (raw.length > 0) groups.push({ label: 'Raw Materials', items: raw });
    if (processed.length > 0) groups.push({ label: 'Processed', items: processed });
    if (final.length > 0) groups.push({ label: 'Products', items: final });

    if (groups.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        padding: '24px', textAlign: 'center', color: '#8892a4',
      });
      empty.textContent = 'No items found';
      this.contentDiv.appendChild(empty);
      return;
    }

    for (const group of groups) {
      this.contentDiv.appendChild(this.renderGroup(group.label, group.items));
    }
  }

  private renderGroup(label: string, items: string[]): HTMLDivElement {
    const section = document.createElement('div');
    section.style.marginBottom = '12px';

    const header = document.createElement('div');
    Object.assign(header.style, {
      fontSize: '10px', fontWeight: '700', color: '#8892a4',
      textTransform: 'uppercase', letterSpacing: '1px',
      padding: '4px 0', marginBottom: '4px',
    });
    header.textContent = label;
    section.appendChild(header);

    for (const id of items) {
      section.appendChild(this.renderItemCard(id));
    }
    return section;
  }

  private renderItemCard(resourceId: string): HTMLDivElement {
    const card = document.createElement('div');
    const recipe = this.recipeByOutput.get(resourceId);
    const isRaw = !recipe;

    // Check discovery: raw materials are always "discovered"
    // For crafted items, check if the recipe has been discovered via experimentation
    const discovered = isRaw || this.recipeBook.isDiscovered(recipe.id);

    Object.assign(card.style, {
      background: '#1c2541', borderRadius: '8px',
      marginBottom: '4px', overflow: 'hidden',
      border: '1px solid #2d354840',
      opacity: discovered ? '1' : '0.4',
    });

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 10px', cursor: discovered ? 'pointer' : 'default',
      transition: 'background 0.15s',
    });
    if (discovered) {
      row.addEventListener('pointerenter', () => { row.style.background = '#2d354850'; });
      row.addEventListener('pointerleave', () => { row.style.background = 'transparent'; });
    }

    if (discovered) {
      // Item visual
      const def = this.resourceRegistry.get(resourceId);
      if (def) {
        const visual = makeItemVisual(def, 24);
        visual.style.flexShrink = '0';
        row.appendChild(visual);
      } else {
        const swatch = document.createElement('div');
        Object.assign(swatch.style, {
          width: '24px', height: '24px', borderRadius: '4px',
          background: this.getResourceColor(resourceId), flexShrink: '0',
        });
        row.appendChild(swatch);
      }

      // Name
      const nameEl = document.createElement('span');
      nameEl.textContent = this.getResourceName(resourceId);
      Object.assign(nameEl.style, { fontWeight: '600', flex: '1' });
      row.appendChild(nameEl);
    } else {
      // Mystery: gray placeholder
      const placeholder = document.createElement('div');
      Object.assign(placeholder.style, {
        width: '24px', height: '24px', borderRadius: '50%',
        background: '#333', flexShrink: '0',
      });
      row.appendChild(placeholder);

      const nameEl = document.createElement('span');
      nameEl.textContent = '???';
      Object.assign(nameEl.style, { fontWeight: '600', flex: '1', color: '#555', fontStyle: 'italic' });
      row.appendChild(nameEl);
    }

    if (discovered) {
      // Tag: raw or machine
      if (!recipe) {
        const tag = document.createElement('span');
        tag.textContent = 'RAW';
        Object.assign(tag.style, {
          fontSize: '9px', fontWeight: '700', color: '#53d769',
          background: '#53d76920', padding: '2px 6px', borderRadius: '4px',
        });
        row.appendChild(tag);
      } else {
        const tag = document.createElement('span');
        tag.textContent = this.getMachineName(recipe.machineType).toUpperCase();
        Object.assign(tag.style, {
          fontSize: '9px', fontWeight: '700',
          color: this.getMachineColor(recipe.machineType),
          background: this.getMachineColor(recipe.machineType) + '20',
          padding: '2px 6px', borderRadius: '4px',
        });
        row.appendChild(tag);
      }
    }

    // Expand arrow (only for discovered)
    const arrow = document.createElement('span');
    arrow.textContent = discovered ? '\u25B6' : '\uD83D\uDD12'; // ▶ or 🔒
    Object.assign(arrow.style, {
      fontSize: '8px', color: '#8892a4',
      transition: 'transform 0.2s', flexShrink: '0',
    });
    row.appendChild(arrow);

    card.appendChild(row);

    // Expandable tree container (hidden by default, only for discovered)
    const treeContainer = document.createElement('div');
    treeContainer.style.display = 'none';
    card.appendChild(treeContainer);

    let expanded = false;
    row.addEventListener('click', () => {
      if (!discovered) return;
      expanded = !expanded;
      if (expanded) {
        arrow.style.transform = 'rotate(90deg)';
        treeContainer.style.display = 'block';
        treeContainer.innerHTML = '';
        if (recipe) {
          treeContainer.appendChild(this.renderCraftingTree(resourceId, 0));
        } else {
          // Raw material info
          treeContainer.appendChild(this.renderRawInfo(resourceId));
        }
      } else {
        arrow.style.transform = 'rotate(0deg)';
        treeContainer.style.display = 'none';
        treeContainer.innerHTML = '';
      }
    });

    return card;
  }

  private renderRawInfo(resourceId: string): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, {
      padding: '8px 12px', borderTop: '1px solid #2d354840',
      color: '#8892a4', fontSize: '11px',
    });
    const def = this.resourceRegistry.get(resourceId);
    if (def) {
      container.textContent = `Available for purchase at shops. Material: ${def.material}`;
    } else {
      container.textContent = 'Raw material — available for purchase.';
    }
    return container;
  }

  /**
   * Render the full crafting tree for a resource.
   * Each node shows: inputs → machine → output
   * Sub-inputs that have their own recipe are expanded recursively.
   */
  private renderCraftingTree(resourceId: string, depth: number): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, {
      borderTop: depth === 0 ? '1px solid #2d354840' : 'none',
      padding: depth === 0 ? '10px 12px' : '0',
    });

    const recipe = this.recipeByOutput.get(resourceId);
    if (!recipe) return container;

    // Render this recipe step
    const step = this.renderRecipeStep(recipe, resourceId, depth);
    container.appendChild(step);

    // Recursively render sub-steps for non-raw inputs
    for (const inp of recipe.inputs) {
      if (!this.isRawMaterial(inp.resourceId)) {
        const subTree = this.renderSubStep(inp.resourceId, depth + 1);
        container.appendChild(subTree);
      }
    }

    return container;
  }

  private renderRecipeStep(recipe: RecipeDefinition, targetOutputId: string, depth: number): HTMLDivElement {
    const step = document.createElement('div');
    const leftPad = depth * 20;
    Object.assign(step.style, {
      display: 'flex', alignItems: 'center', gap: '6px',
      paddingLeft: `${leftPad}px`,
      marginBottom: '6px', flexWrap: 'wrap',
    });

    // Inputs
    for (let i = 0; i < recipe.inputs.length; i++) {
      const inp = recipe.inputs[i];
      if (i > 0) {
        const plus = document.createElement('span');
        plus.textContent = '+';
        Object.assign(plus.style, { color: '#8892a4', fontSize: '10px', fontWeight: '700' });
        step.appendChild(plus);
      }
      step.appendChild(this.renderItemBadge(inp.resourceId, inp.quantity));
    }

    // Arrow
    const arrowEl = document.createElement('span');
    arrowEl.textContent = '\u2192'; // →
    Object.assign(arrowEl.style, { color: '#8892a4', fontSize: '14px' });
    step.appendChild(arrowEl);

    // Machine badge
    const machine = document.createElement('span');
    machine.textContent = this.getMachineName(recipe.machineType);
    const machineColor = this.getMachineColor(recipe.machineType);
    Object.assign(machine.style, {
      fontSize: '9px', fontWeight: '700',
      color: machineColor,
      background: machineColor + '20',
      padding: '2px 6px', borderRadius: '4px',
      border: `1px solid ${machineColor}40`,
    });
    step.appendChild(machine);

    // Arrow
    const arrowEl2 = document.createElement('span');
    arrowEl2.textContent = '\u2192'; // →
    Object.assign(arrowEl2.style, { color: '#8892a4', fontSize: '14px' });
    step.appendChild(arrowEl2);

    // Output
    const output = recipe.outputs.find(o => o.resourceId === targetOutputId) ?? recipe.outputs[0];
    step.appendChild(this.renderItemBadge(output.resourceId, output.quantity, true));

    return step;
  }

  /** Render a sub-step with a vertical tree connector */
  private renderSubStep(resourceId: string, depth: number): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'relative',
    });

    // Connector line
    const connector = document.createElement('div');
    Object.assign(connector.style, {
      position: 'absolute', left: `${(depth - 1) * 20 + 8}px`,
      top: '0', bottom: '50%',
      width: '12px',
      borderLeft: '1px solid #2d3548',
      borderBottom: '1px solid #2d3548',
      borderRadius: '0 0 0 4px',
    });
    container.appendChild(connector);

    container.appendChild(this.renderCraftingTree(resourceId, depth));
    return container;
  }

  private renderItemBadge(resourceId: string, quantity: number, isOutput = false): HTMLDivElement {
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      display: 'flex', alignItems: 'center', gap: '4px',
      background: isOutput ? '#53d76915' : '#0d1525',
      border: `1px solid ${isOutput ? '#53d76940' : '#2d354860'}`,
      borderRadius: '6px', padding: '3px 6px',
    });

    // Mini item visual
    const def = this.resourceRegistry.get(resourceId);
    if (def) {
      const visual = makeItemVisual(def, 14);
      visual.style.flexShrink = '0';
      badge.appendChild(visual);
    }

    // Name + qty
    const text = document.createElement('span');
    const name = this.getResourceName(resourceId);
    text.textContent = quantity > 1 ? `${name} \u00D7${quantity}` : name;
    Object.assign(text.style, {
      fontSize: '10px', fontWeight: isOutput ? '700' : '500',
      color: isOutput ? '#53d769' : '#e8e8e8',
      whiteSpace: 'nowrap',
    });
    badge.appendChild(text);

    // Raw material indicator
    if (this.isRawMaterial(resourceId)) {
      const dot = document.createElement('span');
      dot.textContent = '\u25CF'; // ●
      Object.assign(dot.style, { fontSize: '6px', color: '#53d769' });
      badge.appendChild(dot);
    }

    return badge;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.buildRecipeIndex();
    this.panel.style.display = 'flex';
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
  }

  get isVisible(): boolean { return this.visible; }

  destroy(): void {
    this.panel.remove();
  }
}
