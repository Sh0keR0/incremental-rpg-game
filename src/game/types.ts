export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  expReward: number;
}

export interface GameEventMap {
  attacked: { damage: number; enemyHp: number; enemyName: string };
  enemyDefeated: { name: string; expReward: number };
  expGained: { amount: number; exp: number; expToNext: number };
  leveledUp: { level: number };
  enemySpawned: { name: string; maxHp: number };
}

export type GameEventName = keyof GameEventMap;

export type ComponentClass<T extends IGameComponent = IGameComponent> = new () => T;

export interface GameContext {
  rng(): number;
  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  getGameComponent<T extends IGameComponent>(ctor: ComponentClass<T>): T;
}

export interface IGameComponent {
  readonly id: string;
  initialize?(gameContext: GameContext): void;
  onTick?(dt: number): void;
  save?(): unknown;
  load?(data: unknown): void;
  getState?(): unknown;
}

export interface PlayerState {
  level: number;
  exp: number;
  expToNext: number;
  attack: number;
}

export interface CombatState {
  enemy: Enemy;
}

export interface GameSnapshot {
  player: PlayerState;
  combat: CombatState;
}

export interface Game {
  getState(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  actions: {
    attack(): void;
  };
  start(): void;
  stop(): void;
}
