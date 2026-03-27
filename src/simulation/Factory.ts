import type { ITickable } from '@/interfaces/ITickable';
import type { ISerializable } from '@/interfaces/ISerializable';
import { Grid } from './Grid';
import { Polyomino } from './Polyomino';
import { Belt } from './Belt';
import { Machine } from './Machine';
import { TunnelEntry, TunnelExit } from './Tunnel';
import { Exchanger } from './Exchanger';
import { IOPort } from '@/factory/IOPort';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import { eventBus } from '@/core/EventBus';
import { Direction, directionToVector, oppositeDirection, ALL_DIRECTIONS } from '@/utils/Direction';
import { Vector2 } from '@/utils/Vector2';
import type { FactoryBorderContext } from './FactoryBorderContext';
import { ItemStack } from './ItemStack';

let nextFactoryId = 0;

export interface FactorySaveData {
  id: string;
  polyominoId: string;
  entities: Array<{ type: string; id: string; x: number; y: number; direction?: number; tier?: number; data?: unknown; item?: { resourceId: string; quantity: number } | null; items?: { resourceId: string; quantity: number; progress: number }[] }>;
  ioPorts: Array<{ x: number; y: number; type: 'input' | 'output'; direction: number; filter: string | null; item?: { resourceId: string; quantity: number } | null; bufferQueue?: { resourceId: string; quantity: number }[] }>;
}

export class Factory implements ITickable {
  readonly id: string;
  readonly grid: Grid;
  readonly polyominoId: string;
  sleeping: boolean = false;
  layoutVersion: number = 0;
  borderContext: FactoryBorderContext;

  private belts: Belt[] = [];
  private machines: Machine[] = [];
  private ioPorts: IOPort[] = [];
  private tunnelEntries: TunnelEntry[] = [];
  private tunnelExits: TunnelExit[] = [];
  private exchangers: Exchanger[] = [];

  /** Called when an item is recovered from a deleted entity (belt/port) */
  onItemRecovered: ((item: ItemStack) => void) | null = null;

  constructor(polyominoId: string, shape: Polyomino, borderContext?: FactoryBorderContext) {
    this.id = `factory_${nextFactoryId++}`;
    this.polyominoId = polyominoId;
    this.grid = new Grid(shape);
    this.borderContext = borderContext ?? { edges: [] };
  }

  addBelt(belt: Belt): boolean {
    if (!this.grid.place(belt, belt.position)) return false;
    this.belts.push(belt);
    this.incrementLayout();
    return true;
  }

  addMachine(machine: Machine): boolean {
    if (!this.grid.place(machine, machine.position)) return false;
    machine.factoryId = this.id;
    this.machines.push(machine);
    this.incrementLayout();
    return true;
  }

  addIOPort(port: IOPort): boolean {
    // IOPorts on border road cells are outside the grid — don't use grid.place
    if (this.grid.isInBounds(port.position)) {
      if (!this.grid.place(port, port.position)) return false;
    } else {
      // Border port — just store it
      if (this.hasIOPortAt(port.position)) return false;
    }
    this.ioPorts.push(port);
    this.incrementLayout();
    return true;
  }

  addTunnelEntry(entry: TunnelEntry): boolean {
    if (!this.grid.place(entry, entry.position)) return false;
    this.tunnelEntries.push(entry);
    this.incrementLayout();
    return true;
  }

  addTunnelExit(exit: TunnelExit): boolean {
    if (!this.grid.place(exit, exit.position)) return false;
    this.tunnelExits.push(exit);
    this.incrementLayout();
    return true;
  }

  addExchanger(exchanger: Exchanger): boolean {
    if (!this.grid.place(exchanger, exchanger.position)) return false;
    this.exchangers.push(exchanger);
    this.incrementLayout();
    return true;
  }

  hasIOPortAt(pos: Vector2): boolean {
    return this.ioPorts.some(p => p.position.equals(pos));
  }

  getIOPortAt(pos: Vector2): IOPort | undefined {
    return this.ioPorts.find(p => p.position.equals(pos));
  }

  getMachineAt(pos: Vector2): Machine | undefined {
    return this.machines.find(m => {
      const w = m.effectiveWidth;
      const h = m.effectiveHeight;
      return pos.x >= m.position.x && pos.x < m.position.x + w
        && pos.y >= m.position.y && pos.y < m.position.y + h;
    });
  }

  removeEntity(entity: IGridPlaceable): void {
    // Recover items from the entity before removing
    if (entity instanceof Belt && entity.slots.length > 0) {
      const items = entity.extractAllItems();
      for (const item of items) {
        if (this.onItemRecovered) this.onItemRecovered(item);
      }
    } else if (entity instanceof IOPort) {
      // Recover input buffer
      if (entity.buffer) {
        const item = entity.extractItem();
        if (item && this.onItemRecovered) this.onItemRecovered(item);
      }
      // Recover all output buffer items
      if (this.onItemRecovered) {
        for (const stack of entity.bufferQueue) {
          this.onItemRecovered(new ItemStack(stack.resourceId, stack.quantity));
        }
      }
      entity.bufferQueue = [];
    }

    // Only remove from grid if it's within bounds (border IOPorts aren't in the grid)
    if (this.grid.isInBounds(entity.position)) {
      this.grid.remove(entity);
    }

    if (entity instanceof Belt) {
      const idx = this.belts.indexOf(entity);
      if (idx >= 0) this.belts.splice(idx, 1);
    } else if (entity instanceof Machine) {
      const idx = this.machines.indexOf(entity);
      if (idx >= 0) this.machines.splice(idx, 1);
    } else if (entity instanceof IOPort) {
      const idx = this.ioPorts.indexOf(entity);
      if (idx >= 0) this.ioPorts.splice(idx, 1);
    } else if (entity instanceof TunnelEntry) {
      const idx = this.tunnelEntries.indexOf(entity);
      if (idx >= 0) this.tunnelEntries.splice(idx, 1);
      if (entity.pair) {
        this.removeEntity(entity.pair);
      }
    } else if (entity instanceof TunnelExit) {
      const idx = this.tunnelExits.indexOf(entity);
      if (idx >= 0) this.tunnelExits.splice(idx, 1);
    } else if (entity instanceof Exchanger) {
      const idx = this.exchangers.indexOf(entity);
      if (idx >= 0) this.exchangers.splice(idx, 1);
    }

    this.incrementLayout();
  }

  onTick(deltaTicks: number): void {
    // Tick machines
    for (const machine of this.machines) {
      if (!machine.sleeping) {
        machine.onTick(deltaTicks);
      }
    }

    // Tick belts (advance progress)
    for (const belt of this.belts) {
      if (!belt.sleeping) {
        belt.onTick(1);
      }
    }

    // Tick tunnel entries (transfer items to paired exits)
    for (const entry of this.tunnelEntries) {
      if (!entry.sleeping) {
        entry.onTick(1);
      }
    }

    // Tick exchangers
    for (const exchanger of this.exchangers) {
      if (!exchanger.sleeping) {
        exchanger.onTick(1);
      }
    }

    this.tickTransfers();
  }

  /** Try to push an item from a belt into whatever entity/port is at its output position */
  private transferFromBelt(belt: Belt): void {
    if (!belt.isReadyToTransfer()) return;

    const nextPos = belt.outputPosition;

    // Check IO exit port (not on grid)
    for (const port of this.ioPorts) {
      if (port.portType === 'output' && port.position.equals(nextPos) && port.canAcceptItem()) {
        const item = belt.extractItem();
        if (item) port.acceptItem(item);
        return;
      }
    }

    const nextEntity = this.grid.getAt(nextPos);
    if (!nextEntity) return;

    if (nextEntity instanceof Belt && nextEntity.canAcceptItem()
        && nextEntity.inputPosition.equals(belt.position)) {
      const item = belt.extractItem();
      if (item) nextEntity.acceptItem(item);
    } else if (nextEntity instanceof Machine) {
      const peeked = belt.peekItem();
      if (!peeked || !nextEntity.canAcceptItem(-1, peeked.resourceId)) return;
      // Only accept from the machine's input side
      const inputCells = nextEntity.getInputAdjacentCells();
      if (!inputCells.some(c => c.equals(belt.position))) {
        console.warn(`[Factory] Belt@${belt.position.toKey()} rejected by machine input. Expected: ${inputCells.map(c => c.toKey())} Got: ${belt.position.toKey()}`);
        return;
      }
      const item = belt.extractItem();
      if (item) {
        console.log(`[Factory] Belt→Machine: ${item.resourceId} to ${nextEntity.id}`);
        nextEntity.acceptItem(item);
      }
    } else if (nextEntity instanceof TunnelEntry && nextEntity.canAcceptItem()) {
      const item = belt.extractItem();
      if (item) nextEntity.acceptItem(item);
    } else if (nextEntity instanceof Exchanger) {
      // Only accept from the exchanger's input side
      if (!nextEntity.input0.equals(belt.position) && !nextEntity.input1.equals(belt.position)) return;
      const lane: 0 | 1 = nextPos.equals(nextEntity.cell0) ? 0 : 1;
      if (nextEntity.canAcceptItem(lane)) {
        const item = belt.extractItem();
        if (item) nextEntity.acceptItem(item, lane);
      }
    }
  }

  private tickTransfers(): void {
    // Belt → next entity
    for (const belt of this.belts) {
      this.transferFromBelt(belt);
    }

    // Entry port → internal belt/entity
    for (const port of this.ioPorts) {
      if (port.portType === 'input' && port.hasItem()) {
        const targetPos = port.internalPosition;
        const target = this.grid.getAt(targetPos);
        if (target instanceof Belt && target.canAcceptItem()) {
          const item = port.extractItem();
          if (item) target.acceptItem(item);
        } else if (target instanceof TunnelEntry && target.canAcceptItem()) {
          const item = port.extractItem();
          if (item) target.acceptItem(item);
        } else if (target instanceof Exchanger) {
          const lane: 0 | 1 = targetPos.equals(target.cell0) ? 0 : 1;
          if (target.canAcceptItem(lane)) {
            const item = port.extractItem();
            if (item) target.acceptItem(item, lane);
          }
        }
      }
    }

    // Tunnel exit → belt at output position
    for (const exit of this.tunnelExits) {
      if (!exit.item) continue;
      const outPos = exit.outputPosition;
      const target = this.grid.getAt(outPos);
      if (target instanceof Belt && target.canAcceptItem()) {
        const item = exit.extractItem();
        if (item) target.acceptItem(item);
      } else if (target instanceof Exchanger) {
        const lane: 0 | 1 = outPos.equals(target.cell0) ? 0 : 1;
        if (target.canAcceptItem(lane)) {
          const item = exit.extractItem();
          if (item) target.acceptItem(item, lane);
        }
      }
    }

    // Exchanger → output belts/tunnel entries
    for (const exchanger of this.exchangers) {
      for (const lane of [0, 1] as const) {
        const item = lane === 0 ? exchanger.lane0 : exchanger.lane1;
        if (!item) continue;

        const side = exchanger.getOutputSide();
        // Try preferred output first, then fallback
        const outputs: Array<{ pos: Vector2; lane: 0 | 1 }> = side === 'left'
          ? [{ pos: exchanger.output0, lane: 0 }, { pos: exchanger.output1, lane: 1 }]
          : [{ pos: exchanger.output1, lane: 1 }, { pos: exchanger.output0, lane: 0 }];

        let transferred = false;
        for (const out of outputs) {
          const target = this.grid.getAt(out.pos);
          if (target instanceof Belt && target.canAcceptItem()) {
            const extracted = exchanger.extractItem(lane);
            if (extracted) { target.acceptItem(extracted); transferred = true; break; }
          } else if (target instanceof Exchanger && target !== exchanger) {
            const targetLane: 0 | 1 = out.pos.equals(target.cell0) ? 0 : 1;
            if (target.canAcceptItem(targetLane)) {
              const extracted = exchanger.extractItem(lane);
              if (extracted) { target.acceptItem(extracted, targetLane); transferred = true; break; }
            }
          } else if (target instanceof TunnelEntry && target.canAcceptItem()) {
            const extracted = exchanger.extractItem(lane);
            if (extracted) { target.acceptItem(extracted); transferred = true; break; }
          }
          // Also check IO exit port
          for (const port of this.ioPorts) {
            if (port.portType === 'output' && port.position.equals(out.pos) && port.canAcceptItem()) {
              const extracted = exchanger.extractItem(lane);
              if (extracted) { port.acceptItem(extracted); transferred = true; break; }
            }
          }
          if (transferred) break;
        }

        // Toggle alternator only on successful transfer
        if (transferred && exchanger.mode === 'alternate') {
          exchanger.outputToggle = !exchanger.outputToggle;
        }
      }
    }

    // Machine → output-side adjacent belt/entity
    for (const machine of this.machines) {
      for (let i = 0; i < machine.outputSlots.length; i++) {
        if (machine.outputSlots[i] === null) continue;

        let transferred = false;
        const outputCells = machine.getOutputAdjacentCells();
        for (const checkPos of outputCells) {
          const neighbor = this.grid.getAt(checkPos);
          if (neighbor instanceof Belt && neighbor.canAcceptItem()) {
            const item = machine.extractOutput(i);
            if (item) { console.log(`[Factory] Machine→Belt: ${item.resourceId} from ${machine.id} to belt@${checkPos.toKey()}`); neighbor.acceptItem(item); transferred = true; break; }
          } else if (neighbor instanceof TunnelEntry && neighbor.canAcceptItem()) {
            const item = machine.extractOutput(i);
            if (item) { neighbor.acceptItem(item); transferred = true; break; }
          } else if (neighbor instanceof Exchanger) {
            const lane: 0 | 1 = checkPos.equals(neighbor.cell0) ? 0 : 1;
            if (neighbor.canAcceptItem(lane)) {
              const item = machine.extractOutput(i);
              if (item) { neighbor.acceptItem(item, lane); transferred = true; break; }
            }
          }
          // Also check IO exit ports at output cells
          if (!transferred) {
            for (const port of this.ioPorts) {
              if (port.portType === 'output' && port.position.equals(checkPos) && port.canAcceptItem()) {
                const item = machine.extractOutput(i);
                if (item) { port.acceptItem(item); transferred = true; break; }
              }
            }
          }
          if (transferred) break;
        }
        if (!transferred) {
          console.warn(`[Factory] Machine ${machine.id} output blocked. Output cells: ${outputCells.map(c => c.toKey())}. Neighbors: ${outputCells.map(c => { const n = this.grid.getAt(c); return `${c.toKey()}=${n ? n.id : 'empty'}`; })}`);
        }
      }
    }
  }

  /** Check if a belt's output connects to something that can actually receive from it */
  private beltHasOutput(belt: Belt): boolean {
    const outPos = belt.outputPosition;
    const entity = this.grid.getAt(outPos);
    if (entity) {
      if (entity instanceof Belt) {
        if (entity.inputPosition.equals(belt.position)) return true;
      } else if (entity instanceof Machine) {
        // Only valid if this belt feeds the machine's input side
        return entity.getInputAdjacentCells().some(c => c.equals(belt.position));
      } else if (entity instanceof Exchanger) {
        // Only valid if belt is on the exchanger's input side
        return entity.input0.equals(belt.position) || entity.input1.equals(belt.position);
      } else {
        // Tunnel entry — always valid
        return true;
      }
    }
    // IO port (exit) at output position
    if (this.getIOPortAt(outPos)) return true;
    return false;
  }

  /** Check if a belt is fed by a non-belt entity (splitter, tunnel exit, entry port, machine output) */
  private beltFedByEntity(belt: Belt): boolean {
    const pos = belt.position;
    for (const s of this.exchangers) {
      if (s.output0.equals(pos) || s.output1.equals(pos)) return true;
    }
    for (const e of this.tunnelExits) {
      if (e.outputPosition.equals(pos)) return true;
    }
    for (const p of this.ioPorts) {
      if (p.portType === 'input' && p.internalPosition.equals(pos)) return true;
    }
    for (const m of this.machines) {
      if (m.getOutputAdjacentCells().some(c => c.equals(pos))) return true;
    }
    return false;
  }

  /** Find the direction from which a non-belt entity feeds this belt (machine, exchanger, tunnel, port). */
  private findNonBeltSourceDir(belt: Belt): Direction | undefined {
    const pos = belt.position;

    // Machine output → belt
    for (const m of this.machines) {
      if (m.getOutputAdjacentCells().some(c => c.equals(pos))) {
        // Find which direction the machine is relative to the belt
        for (const dir of ALL_DIRECTIONS) {
          const checkPos = pos.add(directionToVector(dir));
          if (m.getCells().some(c => c.add(m.position).equals(checkPos))) {
            return dir;
          }
        }
      }
    }

    // Exchanger output → belt
    for (const s of this.exchangers) {
      if (s.output0.equals(pos)) return oppositeDirection(s.direction);
      if (s.output1.equals(pos)) return oppositeDirection(s.direction);
    }

    // Tunnel exit → belt
    for (const e of this.tunnelExits) {
      if (e.outputPosition.equals(pos)) return oppositeDirection(e.direction);
    }

    // Input port → belt
    for (const p of this.ioPorts) {
      if (p.portType === 'input' && p.internalPosition.equals(pos)) {
        return oppositeDirection(p.direction);
      }
    }

    return undefined;
  }

  updateBeltShapes(): void {
    // Pass 1: Auto-connect dead-end belts to adjacent unfed belts
    // A dead-end belt outputs to an empty cell (no belt/entity/port there).
    // If an adjacent belt has no feeder and is reachable, redirect the dead-end toward it.
    // Only skip belts fed by splitter/tunnel/port — belt-to-belt corners should still form.
    for (const belt of this.belts) {
      if (this.beltHasOutput(belt)) continue; // not a dead end
      if (this.beltFedByEntity(belt)) continue; // fed by splitter/tunnel/port, keep direction

      // Check adjacent entities: unfed belts, machine inputs, exchanger inputs
      for (const dir of ALL_DIRECTIONS) {
        if (dir === oppositeDirection(belt.direction)) continue; // don't reverse
        const neighborPos = belt.position.add(directionToVector(dir));
        const neighbor = this.grid.getAt(neighborPos);

        if (neighbor instanceof Belt) {
          // Skip neighbors that output to us — redirecting toward them creates a loop
          if (neighbor.outputPosition.equals(belt.position)) continue;
          // Only redirect toward a neighbor that has no belt feeding into it
          let neighborFedByBelt = false;
          for (const b of this.belts) {
            if (b !== belt && b.outputPosition.equals(neighborPos)) { neighborFedByBelt = true; break; }
          }
          if (!neighborFedByBelt) {
            belt.direction = dir;
            break;
          }
        } else if (neighbor instanceof Machine) {
          // Redirect toward machine if it accepts input from this direction
          if (neighbor.getInputAdjacentCells().some(c => c.equals(belt.position))) {
            belt.direction = dir;
            break;
          }
        } else if (neighbor instanceof Exchanger) {
          // Only redirect toward exchanger if belt would be at its input side
          if (neighbor.input0.equals(belt.position) || neighbor.input1.equals(belt.position)) {
            belt.direction = dir;
            break;
          }
        }
      }
    }

    // Pass 2: Compute shapes based on actual connections
    for (const belt of this.belts) {
      let prevBelt: Belt | null = null;
      let sourceDir: Direction | undefined;

      // Priority: prefer the belt feeding from the straight-back direction
      const straightBackDir = oppositeDirection(belt.direction);
      const straightBackPos = belt.position.add(directionToVector(straightBackDir));
      const straightBack = this.grid.getAt(straightBackPos);
      if (straightBack instanceof Belt && straightBack.outputPosition.equals(belt.position)) {
        prevBelt = straightBack;
      } else {
        // Fallback: check other directions for a feeder belt
        for (const dir of ALL_DIRECTIONS) {
          const neighborPos = belt.position.add(directionToVector(dir));
          const neighbor = this.grid.getAt(neighborPos);
          if (neighbor instanceof Belt && neighbor.outputPosition.equals(belt.position)) {
            prevBelt = neighbor;
            break;
          }
        }
      }

      // If no feeder belt, check for non-belt sources (machine output, exchanger, tunnel, port)
      if (!prevBelt) {
        sourceDir = this.findNonBeltSourceDir(belt);
      }

      const nextPos = belt.outputPosition;
      const next = this.grid.getAt(nextPos);
      belt.updateShape(
        prevBelt,
        next instanceof Belt ? next : null,
        sourceDir,
      );
    }
  }

  getBelts(): readonly Belt[] { return this.belts; }
  getMachines(): readonly Machine[] { return this.machines; }
  getIOPorts(): readonly IOPort[] { return this.ioPorts; }
  getTunnelEntries(): readonly TunnelEntry[] { return this.tunnelEntries; }
  getTunnelExits(): readonly TunnelExit[] { return this.tunnelExits; }
  getExchangers(): readonly Exchanger[] { return this.exchangers; }

  private incrementLayout(): void {
    this.layoutVersion++;
    eventBus.emit('LayoutChanged', { factoryId: this.id, layoutVersion: this.layoutVersion });
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }

  clear(): void {
    this.belts = [];
    this.machines = [];
    this.ioPorts = [];
    this.grid.clear();
    this.incrementLayout();
  }

  serialize(): FactorySaveData {
    // Build tunnel pair index so we can link entries to exits on restore
    let tunnelPairIdx = 0;
    const tunnelPairMap = new Map<TunnelEntry, number>();
    for (const entry of this.tunnelEntries) {
      if (entry.pair) {
        tunnelPairMap.set(entry, tunnelPairIdx++);
      }
    }

    return {
      id: this.polyominoId,
      polyominoId: this.polyominoId,
      entities: [
        ...this.belts.map(b => ({
          type: 'belt' as const,
          id: b.id,
          x: b.position.x,
          y: b.position.y,
          direction: b.direction,
          tier: b.tier,
          items: b.slots.map(s => ({ resourceId: s.item.resourceId, quantity: s.item.quantity, progress: s.progress })),
        })),
        ...this.machines.map(m => ({
          type: 'machine' as const,
          id: m.id,
          x: m.position.x,
          y: m.position.y,
          data: { definitionId: m.definition.id, rotation: m.rotation, selectedRecipeId: m.selectedRecipeId },
        })),
        ...this.tunnelEntries.map(t => ({
          type: 'tunnel_entry' as const,
          id: t.id,
          x: t.position.x,
          y: t.position.y,
          direction: t.direction,
          tier: t.tier,
          data: { pairIndex: tunnelPairMap.get(t) ?? -1 },
          item: t.item ? { resourceId: t.item.resourceId, quantity: t.item.quantity } : null,
        })),
        ...this.tunnelExits.map(t => {
          // Find the entry that pairs with this exit
          const entry = this.tunnelEntries.find(e => e.pair === t);
          return {
            type: 'tunnel_exit' as const,
            id: t.id,
            x: t.position.x,
            y: t.position.y,
            direction: t.direction,
            data: { pairIndex: entry ? (tunnelPairMap.get(entry) ?? -1) : -1 },
            item: t.item ? { resourceId: t.item.resourceId, quantity: t.item.quantity } : null,
          };
        }),
        ...this.exchangers.map(s => ({
          type: 'exchanger' as const,
          id: s.id,
          x: s.position.x,
          y: s.position.y,
          direction: s.direction,
          tier: s.tier,
          data: { mode: s.mode, filterResourceId: s.filterResourceId, ratio: s.ratio },
        })),
      ],
      ioPorts: this.ioPorts.map(p => ({
        x: p.position.x,
        y: p.position.y,
        type: p.portType,
        direction: p.direction,
        filter: p.resourceFilter,
        item: p.portType === 'input' && p.buffer
          ? { resourceId: p.buffer.resourceId, quantity: p.buffer.quantity }
          : null,
        bufferQueue: p.portType === 'output'
          ? p.bufferQueue.map(s => ({ resourceId: s.resourceId, quantity: s.quantity }))
          : undefined,
      })),
    };
  }

  restoreEntities(
    data: FactorySaveData,
    createMachine: (defId: string, pos: Vector2) => Machine | null,
  ): void {
    // Collect tunnel entries/exits by pairIndex for linking
    const tunnelEntriesByPair = new Map<number, TunnelEntry>();
    const tunnelExitsByPair = new Map<number, TunnelExit>();

    for (const e of data.entities) {
      const pos = new Vector2(e.x, e.y);
      if (e.type === 'belt') {
        const belt = new Belt(pos, e.direction ?? Direction.Right, e.tier ?? 1);
        this.addBelt(belt);
        if (e.items && e.items.length > 0) {
          for (const s of e.items) {
            belt.slots.push({ item: new ItemStack(s.resourceId, s.quantity), progress: s.progress });
          }
          belt.wake();
        } else if (e.item) {
          // Backward compat with old save format
          belt.acceptItem(new ItemStack(e.item.resourceId, e.item.quantity));
        }
      } else if (e.type === 'machine') {
        const defId = (e.data as any)?.definitionId;
        if (!defId) continue;
        const machine = createMachine(defId, pos);
        if (machine) {
          machine.rotation = (e.data as any)?.rotation ?? 0;
          machine.selectedRecipeId = (e.data as any)?.selectedRecipeId ?? null;
          this.addMachine(machine);
        }
      } else if (e.type === 'tunnel_entry') {
        const entry = new TunnelEntry(pos, e.direction ?? Direction.Right, e.tier ?? 1);
        this.addTunnelEntry(entry);
        if (e.item) {
          entry.item = new ItemStack(e.item.resourceId, e.item.quantity);
        }
        const pairIndex = (e.data as any)?.pairIndex ?? -1;
        if (pairIndex >= 0) tunnelEntriesByPair.set(pairIndex, entry);
      } else if (e.type === 'tunnel_exit') {
        const exit = new TunnelExit(pos, e.direction ?? Direction.Right);
        this.addTunnelExit(exit);
        if (e.item) {
          exit.receiveItem(new ItemStack(e.item.resourceId, e.item.quantity));
        }
        const pairIndex = (e.data as any)?.pairIndex ?? -1;
        if (pairIndex >= 0) tunnelExitsByPair.set(pairIndex, exit);
      } else if (e.type === 'exchanger' || e.type === 'splitter' || e.type === 'merger') {
        const exchanger = new Exchanger(pos, e.direction ?? Direction.Right, e.tier ?? 1);
        const d = e.data as any;
        if (d?.mode) exchanger.mode = d.mode;
        if (d?.filterResourceId) exchanger.filterResourceId = d.filterResourceId;
        if (d?.ratio) exchanger.ratio = d.ratio;
        this.addExchanger(exchanger);
      }
    }

    // Link tunnel pairs
    for (const [idx, entry] of tunnelEntriesByPair) {
      const exit = tunnelExitsByPair.get(idx);
      if (exit) entry.pair = exit;
    }

    for (const p of data.ioPorts) {
      const port = new IOPort(new Vector2(p.x, p.y), p.type, p.direction);
      port.resourceFilter = p.filter;
      this.addIOPort(port);
      if (p.item) {
        port.buffer = new ItemStack(p.item.resourceId, p.item.quantity);
      }
      if (p.bufferQueue) {
        port.bufferQueue = p.bufferQueue.map(s => new ItemStack(s.resourceId, s.quantity));
      }
    }
    this.updateBeltShapes();
  }
}
