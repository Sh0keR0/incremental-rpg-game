export interface Item {
  id: string;
  name: string;
  attack: number;
}

export const GAME_ITEMS: Item[] = [];

GAME_ITEMS.push({ id: 'WoodenSword', name: 'Wooden Sword', attack: 3 });
GAME_ITEMS.push({ id: 'ShortSword', name: 'Short Sword', attack: 5 });

export function getItemById(id: string): Item | undefined {
  return GAME_ITEMS[GAME_ITEMS.findIndex((item) => item.id === id)];
}
