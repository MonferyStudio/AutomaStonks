import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { TalentTree, TalentNodeDefinition } from '@/economy/TalentTree';
import type { Wallet } from '@/economy/Wallet';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const NODE_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_PRIMARY,
});

const COST_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.ACCENT_VIOLET,
});

const BRANCH_COLORS: Record<string, number> = {
  production: COLORS.FACTORY,
  commerce: COLORS.SHOP,
  logistics: COLORS.ACCENT_VIOLET,
  economy: COLORS.ACCENT_YELLOW,
};

const PANEL_WIDTH = 340;
const PANEL_PADDING = 14;
const NODE_WIDTH = 145;
const NODE_HEIGHT = 50;
const NODE_GAP = 10;

export class TalentTreeUI {
  readonly container: Container;
  private contentContainer: Container;
  private talentTree: TalentTree;
  private wallet: Wallet;
  private visible = false;
  private bg: Graphics;

  constructor(talentTree: TalentTree, wallet: Wallet) {
    this.talentTree = talentTree;
    this.wallet = wallet;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'TALENT TREE', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    const talentDisplay = new Container();
    const talentIcon = new Graphics();
    talentIcon.moveTo(0, -5);
    talentIcon.lineTo(5, 0);
    talentIcon.lineTo(0, 5);
    talentIcon.lineTo(-5, 0);
    talentIcon.closePath();
    talentIcon.fill(COLORS.ACCENT_VIOLET);
    talentDisplay.addChild(talentIcon);
    const talentText = new Text({
      text: formatNumber(wallet.talent),
      style: COST_STYLE,
    });
    talentText.position.set(10, -7);
    talentDisplay.addChild(talentText);
    talentDisplay.position.set(PANEL_WIDTH - 60, PANEL_PADDING + 2);
    this.container.addChild(talentDisplay);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 30);
    this.container.addChild(this.contentContainer);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.rebuild();
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();

    const branches: TalentNodeDefinition['branch'][] = ['production', 'commerce', 'logistics', 'economy'];
    let yOffset = 0;

    for (const branch of branches) {
      const nodes = this.talentTree.getNodesByBranch(branch);
      if (nodes.length === 0) continue;

      const branchLabel = new Text({
        text: branch.toUpperCase(),
        style: new TextStyle({
          fontFamily: 'Space Mono, monospace',
          fontSize: 9,
          fontWeight: '600',
          fill: BRANCH_COLORS[branch] ?? COLORS.TEXT_DIM,
          letterSpacing: 1,
        }),
      });
      branchLabel.position.set(0, yOffset);
      this.contentContainer.addChild(branchLabel);
      yOffset += 18;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = col * (NODE_WIDTH + NODE_GAP);
        const y = yOffset + row * (NODE_HEIGHT + NODE_GAP);

        const nodeContainer = this.createNodeGraphic(node);
        nodeContainer.position.set(x, y);
        this.contentContainer.addChild(nodeContainer);
      }

      yOffset += Math.ceil(nodes.length / 2) * (NODE_HEIGHT + NODE_GAP) + 8;
    }

    const panelHeight = PANEL_PADDING * 2 + 30 + yOffset + 10;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  private createNodeGraphic(node: TalentNodeDefinition): Container {
    const c = new Container();
    const unlocked = this.talentTree.isUnlocked(node.id);
    const canUnlock = this.talentTree.canUnlock(node.id);
    const branchColor = BRANCH_COLORS[node.branch] ?? COLORS.TEXT_DIM;

    const bg = new Graphics();
    bg.roundRect(0, 0, NODE_WIDTH, NODE_HEIGHT, 6);
    if (unlocked) {
      bg.fill({ color: branchColor, alpha: 0.25 });
      bg.roundRect(0, 0, NODE_WIDTH, NODE_HEIGHT, 6);
      bg.stroke({ color: branchColor, alpha: 0.6, width: 1.5 });
    } else if (canUnlock) {
      bg.fill({ color: COLORS.BG_CARD, alpha: 0.9 });
      bg.roundRect(0, 0, NODE_WIDTH, NODE_HEIGHT, 6);
      bg.stroke({ color: branchColor, alpha: 0.4, width: 1 });
    } else {
      bg.fill({ color: COLORS.BG_CARD, alpha: 0.4 });
    }
    c.addChild(bg);

    const name = new Text({ text: node.name, style: NODE_STYLE });
    name.position.set(8, 6);
    if (!canUnlock && !unlocked) name.alpha = 0.4;
    c.addChild(name);

    const desc = new Text({
      text: node.description,
      style: new TextStyle({ fontFamily: 'DM Sans, sans-serif', fontSize: 8, fill: COLORS.TEXT_DIM, wordWrap: true, wordWrapWidth: NODE_WIDTH - 16 }),
    });
    desc.position.set(8, 22);
    c.addChild(desc);

    if (!unlocked) {
      const costText = new Text({ text: formatNumber(node.cost), style: COST_STYLE });
      costText.anchor.set(1, 1);
      costText.position.set(NODE_WIDTH - 8, NODE_HEIGHT - 6);
      c.addChild(costText);
    }

    if (canUnlock) {
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        this.talentTree.unlock(node.id);
        this.rebuild();
      });
    }

    return c;
  }

  positionAt(screenWidth: number, screenHeight: number): void {
    this.container.position.set(
      (screenWidth - PANEL_WIDTH) / 2,
      (screenHeight - this.container.height) / 2,
    );
  }
}
