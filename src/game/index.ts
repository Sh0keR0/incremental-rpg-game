// Public API. Import only from here so engine internals and components stay
// unreachable from the UI.
export { createGame } from './createGame.ts';
export type { Game, GameOptions, GameSnapshot } from './createGame.ts';
export type { CombatState } from './components/Combat.ts';
export type { PlayerState } from './components/Player.ts';
export type { PlayerStatsState } from './components/PlayerStats.ts';
export type { FeatureKey, UnlocksState } from './components/Unlocks.ts';
export type { GameEventMap, GameEventName, StatName } from './types.ts';
