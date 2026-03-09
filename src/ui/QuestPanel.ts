import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { QuestManager } from '@/economy/QuestManager';
import { eventBus } from '@/core/EventBus';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const QUEST_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11,
  fill: COLORS.TEXT_PRIMARY,
});

const DESC_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 9,
  fill: COLORS.TEXT_DIM,
});

const REWARD_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.ACCENT_VIOLET,
});

const PANEL_WIDTH = 260;
const PANEL_PADDING = 14;
const ROW_HEIGHT = 52;

export class QuestPanel {
  readonly container: Container;
  private contentContainer: Container;
  private questManager: QuestManager;
  private visible = false;
  private bg: Graphics;

  constructor(questManager: QuestManager) {
    this.questManager = questManager;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'OBJECTIVES', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 28);
    this.container.addChild(this.contentContainer);

    eventBus.on('QuestCompleted', () => this.rebuild());
    eventBus.on('ItemProduced', () => { if (this.visible) this.rebuild(); });
    eventBus.on('ItemSold', () => { if (this.visible) this.rebuild(); });
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

    const quests = this.questManager.getQuests();
    let yOffset = 0;

    for (const { def, progress } of quests) {
      const row = new Container();
      row.position.set(0, yOffset);

      const rowBg = new Graphics();
      rowBg.roundRect(0, 0, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4, 6);
      rowBg.fill({ color: COLORS.BG_CARD, alpha: progress.completed ? 0.4 : 0.8 });
      row.addChild(rowBg);

      if (progress.completed) {
        const check = new Graphics();
        check.circle(14, ROW_HEIGHT / 2 - 2, 6);
        check.fill(COLORS.IO_INPUT);
        row.addChild(check);
      } else {
        const dot = new Graphics();
        dot.circle(14, ROW_HEIGHT / 2 - 2, 4);
        dot.stroke({ color: COLORS.TEXT_DIM, width: 1.5 });
        row.addChild(dot);
      }

      const nameText = new Text({ text: def.name, style: QUEST_STYLE });
      nameText.position.set(28, 5);
      if (progress.completed) nameText.alpha = 0.5;
      row.addChild(nameText);

      const descText = new Text({ text: def.description, style: DESC_STYLE });
      descText.position.set(28, 20);
      row.addChild(descText);

      const progressStr = progress.completed
        ? 'DONE'
        : `${formatNumber(Math.min(progress.current, def.condition.amount))}/${formatNumber(def.condition.amount)}`;
      const progText = new Text({ text: progressStr, style: REWARD_STYLE });
      progText.anchor.set(1, 0);
      progText.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 8, 6);
      row.addChild(progText);

      const rewardText = new Text({
        text: `+${formatNumber(def.reward.talent)}`,
        style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 9, fill: COLORS.ACCENT_VIOLET }),
      });
      rewardText.anchor.set(1, 0);
      rewardText.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 8, 22);
      row.addChild(rewardText);

      const rewardIcon = new Graphics();
      const ix = PANEL_WIDTH - PANEL_PADDING * 2 - 4;
      rewardIcon.moveTo(ix, 22);
      rewardIcon.lineTo(ix + 4, 26);
      rewardIcon.lineTo(ix, 30);
      rewardIcon.lineTo(ix - 4, 26);
      rewardIcon.closePath();
      rewardIcon.fill(COLORS.ACCENT_VIOLET);
      row.addChild(rewardIcon);

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

  positionAt(screenWidth: number, screenHeight: number): void {
    this.container.position.set(screenWidth - PANEL_WIDTH - 10, 70);
  }
}
