export interface ITickable {
  sleeping: boolean;
  onTick(deltaTicks: number): void;
  wake(): void;
  sleep(): void;
}
