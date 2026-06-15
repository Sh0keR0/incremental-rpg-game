// Public API. Import only from here so engine internals and components stay
// unreachable from the UI.
export { createGame } from './createGame.ts';
export type { GameOptions } from './createGame.ts';
export type {
  CombatState,
  Enemy,
  Game,
  GameEventMap,
  GameEventName,
  GameSnapshot,
  PlayerState,
} from './types.ts';
