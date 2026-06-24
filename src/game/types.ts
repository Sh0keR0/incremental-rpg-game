import type { DroppableItem } from './components/Combat.ts';
import type { InventoryData } from './components/Inventory.ts';

export type StatName = 'strength' | 'agility' | 'endurance';

export interface GameEventMap {
  attacked: { damage: number; enemyHp: number; enemyName: string };
  enemyDefeated: { name: string; expReward: number; drops: DroppableItem[] };
  expGained: { amount: number; exp: number; expToNext: number };
  leveledUp: { level: number };
  enemySpawned: { name: string; maxHp: number };
  inventoryUpdated: { inventory: InventoryData };
  statsChanged: { stats: Record<StatName, number>; unspentPoints: number };
  bossUnlocked: { stageName: string };
  bossStarted: { name: string; maxHp: number; timeLimitMs: number };
  bossFailed: { stageName: string };
  stageUnlocked: { stageId: string; stageName: string };
  stageSelected: { stageId: string; stageName: string };
}

export type GameEventName = keyof GameEventMap;

export type ComponentClass<T extends IGameComponent = IGameComponent> = new () => T;

export interface GameContext {
  rng(): number;
  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  getGameComponent<T extends IGameComponent>(componentClass: ComponentClass<T>): T;
}

export interface IGameComponent {
  readonly id: string;
  initialize?(gameContext: GameContext): void;
  onTick?(dt: number): void;
  save?(): unknown;
  load?(data: unknown): void;
  getState?(): unknown;
}
