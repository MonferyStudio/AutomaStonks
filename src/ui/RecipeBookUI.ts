import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { RecipeDefinition } from '@/simulation/Recipe';
import { eventBus } from '@/core/EventBus';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const RECIPE_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11,
  fill: COLORS.TEXT_PRIMARY,
});

const DIM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_DIM,
});

const PANEL_WIDTH = 280;
const PANEL_PADDING = 14;
const ROW_HEIGHT = 42;

export class RecipeBookUI {
  readonly container: Container;
  private contentContainer: Container;
  private recipeBook: RecipeBook;
  private recipeRegistry: RecipeRegistry;
  private resourceRegistry: ResourceRegistry;
  private visible = false;
  private bg: Graphics;

  constructor(
    recipeBook: RecipeBook,
    recipeRegistry: RecipeRegistry,
    resourceRegistry: ResourceRegistry,
  ) {
    this.recipeBook = recipeBook;
    this.recipeRegistry = recipeRegistry;
    this.resourceRegistry = resourceRegistry;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'RECIPE BOOK', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 28);
    this.container.addChild(this.contentContainer);

    eventBus.on('RecipeDiscovered', () => this.rebuild());
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.rebuild();
  }

  show(): void {
    this.visible = true;
    this.container.visible = true;
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();

    const discovered = this.recipeBook.getDiscoveredRecipes();
    const allRecipes = this.recipeRegistry.getAll();
    const totalCount = allRecipes.length;

    const countText = new Text({
      text: `${discovered.length} / ${totalCount} discovered`,
      style: DIM_STYLE,
    });
    this.contentContainer.addChild(countText);

    let yOffset = 24;

    for (const recipe of allRecipes) {
      const isDiscovered = this.recipeBook.isDiscovered(recipe.id);
      const row = this.createRecipeRow(recipe, isDiscovered, yOffset);
      this.contentContainer.addChild(row);
      yOffset += ROW_HEIGHT;
    }

    const panelHeight = PANEL_PADDING * 2 + 28 + yOffset + 10;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  private createRecipeRow(recipe: RecipeDefinition, discovered: boolean, y: number): Container {
    const row = new Container();
    row.position.set(0, y);

    const rowBg = new Graphics();
    rowBg.roundRect(0, 0, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4, 6);
    rowBg.fill({ color: COLORS.BG_CARD, alpha: discovered ? 0.8 : 0.3 });
    row.addChild(rowBg);

    if (discovered) {
      const inputNames = recipe.inputs
        .map((i) => {
          const res = this.resourceRegistry.get(i.resourceId);
          return res ? `${res.name} x${i.quantity}` : i.resourceId;
        })
        .join(' + ');

      const outputNames = recipe.outputs
        .map((o) => {
          const res = this.resourceRegistry.get(o.resourceId);
          return res ? `${res.name} x${o.quantity}` : o.resourceId;
        })
        .join(', ');

      const inputText = new Text({ text: inputNames, style: DIM_STYLE });
      inputText.position.set(8, 5);
      row.addChild(inputText);

      const arrow = new Text({ text: `-> ${outputNames}`, style: RECIPE_STYLE });
      arrow.position.set(8, 20);
      row.addChild(arrow);

      const machineLabel = new Text({
        text: recipe.machineType.toUpperCase(),
        style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 8, fill: COLORS.ACCENT_VIOLET }),
      });
      machineLabel.anchor.set(1, 0);
      machineLabel.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 8, 6);
      row.addChild(machineLabel);
    } else {
      const unknownText = new Text({ text: '??? -> ???', style: DIM_STYLE });
      unknownText.position.set(8, 13);
      row.addChild(unknownText);
    }

    return row;
  }

  positionAt(screenWidth: number, _screenHeight: number): void {
    this.container.position.set(screenWidth - PANEL_WIDTH - 10, 70);
  }
}
