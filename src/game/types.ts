import type { DroppableItem } from './content/enemies.ts';
import type { InventoryData } from './components/Inventory.ts';

export type StatName = 'strength' | 'agility' | 'endurance';

export interface GameEventMap {
  attacked: { damage: number; enemyHp: number; enemyName: string };
  enemyDefeated: { name: string; expReward: number; drops: DroppableItem[]; isBoss: boolean };
  expGained: { amount: number; exp: number; expToNext: number };
  leveledUp: { level: number };
  enemySpawned: { name: string; maxHp: number };
  inventoryUpdated: { inventory: InventoryData };
  statsChanged: { stats: Record<StatName, number>; unspentPoints: number };
  // Stage/boss facts carry only the stage id; display names and boss stats are
  // static content the listener resolves from STAGES (see content/stages.ts).
  bossUnlocked: { stageId: string };
  bossStarted: { stageId: string };
  bossFailed: { stageId: string };
  stageUnlocked: { stageId: string };
  stageSelected: { stageId: string };
}

export type GameEventName = keyof GameEventMap;

export interface GameCommandMap {
  attack: Record<string, never>;
  allocateStat: { statName: StatName };
  fightBoss: Record<string, never>;
  selectStage: { stageId: string };
}

export type GameCommandName = keyof GameCommandMap;

export type ComponentClass<T extends IGameComponent = IGameComponent> = new () => T;

export interface GameContext {
  rng(): number;
  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  enqueue<K extends GameCommandName>(name: K, payload: GameCommandMap[K]): void;
  handle<K extends GameCommandName>(name: K, handler: (payload: GameCommandMap[K]) => void): void;
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
