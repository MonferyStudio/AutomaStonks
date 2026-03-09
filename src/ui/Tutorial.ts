import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { eventBus } from '@/core/EventBus';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 12,
  fontWeight: '700',
  fill: COLORS.ACCENT_YELLOW,
});

const BODY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fill: COLORS.TEXT_PRIMARY,
  wordWrap: true,
  wordWrapWidth: 280,
  lineHeight: 16,
});

const HINT_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 9,
  fill: COLORS.TEXT_DIM,
});

interface TutorialStep {
  title: string;
  body: string;
  trigger?: keyof typeof TRIGGERS;
}

const TRIGGERS = {
  place_belt: 'EntityPlaced',
  place_machine: 'EntityPlaced',
  produce_item: 'ItemProduced',
  sell_item: 'ItemSold',
  enter_city: 'ViewChanged',
} as const;

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Automastonks!',
    body: 'Build factories, produce goods, and grow your industrial empire. Click a city on the world map to begin.',
    trigger: 'enter_city',
  },
  {
    title: 'Your First Factory',
    body: 'Purchase a factory slot in the city, then enter it. Use the toolbar to place belts and machines on the grid.',
    trigger: 'place_belt',
  },
  {
    title: 'Placing Machines',
    body: 'Select a machine from the toolbar and place it on the grid. Machines process items that arrive on belts. Connect an input port to feed raw materials.',
    trigger: 'place_machine',
  },
  {
    title: 'Production',
    body: 'When a machine receives the right inputs, it produces output. Invalid combinations create Dust. Experiment to discover new recipes!',
    trigger: 'produce_item',
  },
  {
    title: 'Selling Goods',
    body: 'Connect a belt to an output port to sell produced items. Items reaching output ports are automatically sold at the market price.',
    trigger: 'sell_item',
  },
  {
    title: 'You\'re Ready!',
    body: 'Explore the world map, unlock new cities, set up transport routes, and discover all recipes. Press ESC to navigate back. Good luck!',
  },
];

export class Tutorial {
  readonly container: Container;
  private bg: Graphics;
  private titleText: Text;
  private bodyText: Text;
  private hintText: Text;
  private currentStep = 0;
  completed = false;
  dismissed = false;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    this.container = new Container();
    this.container.zIndex = 150;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.titleText = new Text({ text: '', style: TITLE_STYLE });
    this.titleText.position.set(14, 12);
    this.container.addChild(this.titleText);

    this.bodyText = new Text({ text: '', style: BODY_STYLE });
    this.bodyText.position.set(14, 34);
    this.container.addChild(this.bodyText);

    this.hintText = new Text({ text: 'Click to continue | X to dismiss', style: HINT_STYLE });
    this.container.addChild(this.hintText);

    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointertap', () => this.advance());

    this.showStep();
    this.setupTriggers();
  }

  private showStep(): void {
    if (this.completed || this.dismissed) {
      this.container.visible = false;
      return;
    }

    const step = TUTORIAL_STEPS[this.currentStep];
    if (!step) {
      this.completed = true;
      this.container.visible = false;
      return;
    }

    this.titleText.text = step.title;
    this.bodyText.text = step.body;

    const width = 320;
    const height = this.bodyText.y + this.bodyText.height + 36;

    this.hintText.position.set(14, height - 20);

    this.bg.clear();
    this.bg.roundRect(0, 0, width, height, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.97 });
    this.bg.stroke({ color: COLORS.ACCENT_YELLOW, width: 1, alpha: 0.4 });

    this.container.visible = true;
  }

  private setupTriggers(): void {
    for (const step of TUTORIAL_STEPS) {
      if (step.trigger) {
        const eventName = TRIGGERS[step.trigger];
        if (eventName) {
          const unsub = eventBus.on(eventName as any, () => {
            const current = TUTORIAL_STEPS[this.currentStep];
            if (current?.trigger === step.trigger) {
              this.advance();
            }
          });
          this.unsubscribers.push(unsub);
        }
      }
    }
  }

  advance(): void {
    this.currentStep++;
    this.showStep();
  }

  dismiss(): void {
    this.dismissed = true;
    this.container.visible = false;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  handleKeyDown(key: string): void {
    if (key === 'x' || key === 'X') {
      this.dismiss();
    }
  }

  positionAt(width: number, height: number): void {
    this.container.position.set(width / 2 - 160, height - 180);
  }
}
