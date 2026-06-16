import type { GameContext, IGameComponent } from '../types.ts';
import { findFirstAvailable } from '../../utils/utils.ts';
import { getItemById } from '../content/items.ts';

export interface InventoryData {
  slots: (string | undefined)[][];
}

function createEmptyInventory(rows: number, cols: number) {
  const inventory: (string | undefined)[][] = [];
  for (let i = 0; i < rows; i++) {
    inventory[i] = [];
    for (let j = 0; j < cols; j++) {
      inventory[i][j] = undefined;
    }
  }

  return inventory;
}

class Inventory implements IGameComponent {
  readonly id = 'inventory';
  private inventoryData: InventoryData = { slots: createEmptyInventory(5, 5) };
  private gameContext!: GameContext;

  initialize(gameContext: GameContext) {
    this.gameContext = gameContext;
  }

  isInventoryFull(): boolean {
    return findFirstAvailable(this.inventoryData.slots) === null;
  }

  add(itemId: string): boolean {
    if (this.isInventoryFull()) {
      return false;
    }

    const indexes = findFirstAvailable(this.inventoryData.slots);
    if (indexes === null) {
      return false;
    }
    this.inventoryData.slots[indexes[0]][indexes[1]] = itemId;
    const item = getItemById(itemId);
    if (typeof item === 'undefined') {
      throw new Error(`Item with id ${itemId} not found.`);
    }

    this.gameContext.emit('inventoryUpdated', { inventory: this.inventoryData });

    return true;
  }

  getState(): InventoryData {
    return this.inventoryData;
  }

  load(data: InventoryData): void {
    this.inventoryData = data;
  }

  save(): unknown {
    return this.inventoryData;
  }
}

export default Inventory;
