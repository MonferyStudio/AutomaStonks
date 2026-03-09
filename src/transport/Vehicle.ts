import type { VehicleTypeDefinition } from './VehicleType';
import type { ItemStack } from '@/simulation/ItemStack';
import { StateMachine, type IState } from '@/simulation/StateMachine';
import type { ITickable } from '@/interfaces/ITickable';

let nextVehicleId = 0;

export type VehicleState = 'loading' | 'in_transit' | 'unloading' | 'returning';

export class Vehicle implements ITickable {
  readonly id: string;
  readonly type: VehicleTypeDefinition;
  sleeping: boolean = false;

  cargo: ItemStack[] = [];
  routeProgress: number = 0;
  routeDistance: number = 0;
  private stateMachine: StateMachine<Vehicle>;

  onLoad: (() => ItemStack[]) | null = null;
  onUnload: ((items: ItemStack[]) => void) | null = null;
  onTripComplete: (() => void) | null = null;

  constructor(type: VehicleTypeDefinition) {
    this.id = `vehicle_${nextVehicleId++}`;
    this.type = type;

    this.stateMachine = new StateMachine<Vehicle>(this);
    this.setupStateMachine();
    this.stateMachine.setState('loading');
  }

  private setupStateMachine(): void {
    this.stateMachine
      .addState(new LoadingState())
      .addState(new InTransitState())
      .addState(new UnloadingState())
      .addState(new ReturningState());

    this.stateMachine.addTransition('loading', 'in_transit', (v) => v.cargo.length > 0);
    this.stateMachine.addTransition('in_transit', 'unloading', (v) => v.routeProgress >= v.routeDistance);
    this.stateMachine.addTransition('unloading', 'returning', (v) => v.cargo.length === 0);
    this.stateMachine.addTransition('returning', 'loading', (v) => v.routeProgress >= v.routeDistance);
  }

  get state(): string {
    return this.stateMachine.currentStateName;
  }

  get normalizedProgress(): number {
    return this.routeDistance > 0 ? this.routeProgress / this.routeDistance : 0;
  }

  get currentCapacityUsed(): number {
    return this.cargo.reduce((sum, item) => sum + item.quantity, 0);
  }

  get remainingCapacity(): number {
    return this.type.capacity - this.currentCapacityUsed;
  }

  onTick(deltaTicks: number): void {
    this.stateMachine.update(deltaTicks);
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}

class LoadingState implements IState<Vehicle> {
  readonly name = 'loading';
  enter(v: Vehicle): void {
    v.routeProgress = 0;
    if (v.onLoad) {
      v.cargo = v.onLoad();
    }
  }
  update(): void {}
  exit(): void {}
}

class InTransitState implements IState<Vehicle> {
  readonly name = 'in_transit';
  enter(): void {}
  update(v: Vehicle, deltaTicks: number): void {
    v.routeProgress += v.type.speed * deltaTicks;
  }
  exit(): void {}
}

class UnloadingState implements IState<Vehicle> {
  readonly name = 'unloading';
  enter(v: Vehicle): void {
    if (v.onUnload) {
      v.onUnload(v.cargo);
    }
    v.cargo = [];
    v.routeProgress = 0;
  }
  update(): void {}
  exit(): void {}
}

class ReturningState implements IState<Vehicle> {
  readonly name = 'returning';
  enter(): void {}
  update(v: Vehicle, deltaTicks: number): void {
    v.routeProgress += v.type.speed * deltaTicks;
  }
  exit(v: Vehicle): void {
    v.onTripComplete?.();
  }
}
