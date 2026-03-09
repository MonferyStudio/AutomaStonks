export interface IState<TContext> {
  readonly name: string;
  enter(context: TContext): void;
  update(context: TContext, deltaTicks: number): void;
  exit(context: TContext): void;
}

export interface Transition<TContext> {
  from: string;
  to: string;
  condition: (context: TContext) => boolean;
}

export class StateMachine<TContext> {
  private states = new Map<string, IState<TContext>>();
  private transitions: Transition<TContext>[] = [];
  private _currentState: IState<TContext> | null = null;

  constructor(private context: TContext) {}

  get currentState(): IState<TContext> | null {
    return this._currentState;
  }

  get currentStateName(): string {
    return this._currentState?.name ?? 'none';
  }

  addState(state: IState<TContext>): this {
    this.states.set(state.name, state);
    return this;
  }

  addTransition(from: string, to: string, condition: (context: TContext) => boolean): this {
    this.transitions.push({ from, to, condition });
    return this;
  }

  setState(name: string): void {
    const newState = this.states.get(name);
    if (!newState) return;

    this._currentState?.exit(this.context);
    this._currentState = newState;
    this._currentState.enter(this.context);
  }

  update(deltaTicks: number): void {
    if (!this._currentState) return;

    for (const transition of this.transitions) {
      if (transition.from === this._currentState.name && transition.condition(this.context)) {
        this.setState(transition.to);
        return;
      }
    }

    this._currentState.update(this.context, deltaTicks);
  }
}
