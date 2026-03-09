import { Polyomino } from './Polyomino';
import { Vector2 } from '@/utils/Vector2';

export interface PolyominoDefinition {
  id: string;
  name: string;
  category: string;
  cells: [number, number][];
}

export class PolyominoRegistry {
  private byId = new Map<string, Polyomino>();
  private bySize = new Map<number, Polyomino[]>();
  private definitions = new Map<string, PolyominoDefinition>();

  register(def: PolyominoDefinition): void {
    const cells = def.cells.map(([x, y]) => new Vector2(x, y));
    const poly = new Polyomino(cells);
    this.byId.set(def.id, poly);
    this.definitions.set(def.id, def);

    const sizeList = this.bySize.get(poly.cellCount) ?? [];
    sizeList.push(poly);
    this.bySize.set(poly.cellCount, sizeList);
  }

  get(id: string): Polyomino | undefined {
    return this.byId.get(id);
  }

  getDefinition(id: string): PolyominoDefinition | undefined {
    return this.definitions.get(id);
  }

  getBySize(cellCount: number): Polyomino[] {
    return this.bySize.get(cellCount) ?? [];
  }

  getAllIds(): string[] {
    return [...this.byId.keys()];
  }

  loadFromData(data: PolyominoDefinition[]): void {
    for (const def of data) {
      this.register(def);
    }
  }

  static generateStandardPolyominos(): PolyominoDefinition[] {
    const defs: PolyominoDefinition[] = [];

    defs.push({ id: 'mono_1', name: 'Monomino', category: 'monomino', cells: [[0, 0]] });

    defs.push({ id: 'dom_I', name: 'Domino-I', category: 'domino', cells: [[0, 0], [1, 0]] });

    defs.push({ id: 'tro_I', name: 'Tromino-I', category: 'tromino', cells: [[0, 0], [1, 0], [2, 0]] });
    defs.push({ id: 'tro_L', name: 'Tromino-L', category: 'tromino', cells: [[0, 0], [1, 0], [1, 1]] });

    defs.push({ id: 'tet_I', name: 'Tetromino-I', category: 'tetromino', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] });
    defs.push({ id: 'tet_O', name: 'Tetromino-O', category: 'tetromino', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] });
    defs.push({ id: 'tet_T', name: 'Tetromino-T', category: 'tetromino', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] });
    defs.push({ id: 'tet_S', name: 'Tetromino-S', category: 'tetromino', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] });
    defs.push({ id: 'tet_Z', name: 'Tetromino-Z', category: 'tetromino', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] });
    defs.push({ id: 'tet_L', name: 'Tetromino-L', category: 'tetromino', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] });
    defs.push({ id: 'tet_J', name: 'Tetromino-J', category: 'tetromino', cells: [[1, 0], [1, 1], [1, 2], [0, 2]] });

    defs.push({ id: 'pent_F', name: 'Pentomino-F', category: 'pentomino', cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] });
    defs.push({ id: 'pent_I', name: 'Pentomino-I', category: 'pentomino', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] });
    defs.push({ id: 'pent_L', name: 'Pentomino-L', category: 'pentomino', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] });
    defs.push({ id: 'pent_P', name: 'Pentomino-P', category: 'pentomino', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] });
    defs.push({ id: 'pent_T', name: 'Pentomino-T', category: 'pentomino', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] });
    defs.push({ id: 'pent_U', name: 'Pentomino-U', category: 'pentomino', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] });
    defs.push({ id: 'pent_V', name: 'Pentomino-V', category: 'pentomino', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] });
    defs.push({ id: 'pent_W', name: 'Pentomino-W', category: 'pentomino', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] });
    defs.push({ id: 'pent_X', name: 'Pentomino-X', category: 'pentomino', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] });
    defs.push({ id: 'pent_Y', name: 'Pentomino-Y', category: 'pentomino', cells: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]] });
    defs.push({ id: 'pent_Z', name: 'Pentomino-Z', category: 'pentomino', cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] });
    defs.push({ id: 'pent_N', name: 'Pentomino-N', category: 'pentomino', cells: [[1, 0], [1, 1], [0, 1], [0, 2], [0, 3]] });

    return defs;
  }
}
