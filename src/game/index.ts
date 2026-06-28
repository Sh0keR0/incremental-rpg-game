// Public API. Import only from here so engine internals and components stay
// unreachable from the UI. Static game content (read-only data + pure helpers)
// is part of this surface so the UI can compose views without the engine
// re-forwarding static fields through component state.
export { createGame } from './createGame.ts';
export type { Game, GameOptions, GameSnapshot } from './createGame.ts';
export type { CombatState } from './components/Combat.ts';
export type { PlayerState } from './components/Player.ts';
export type { PlayerStatsState } from './components/PlayerStats.ts';
export type { RebornState, RebornUpgrades } from './components/Reborn.ts';
export type { StagesState } from './components/Stages.ts';
export type { FeatureKey, UnlocksState } from './components/Unlocks.ts';
export { getNavigableStageId, getStageById, STAGES } from './content/stages.ts';
export type { StageDefinition } from './content/stages.ts';
export type { GameEventMap, GameEventName, RebornUpgradeKey, StatName } from './types.ts';
