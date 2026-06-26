import type { GameContext, GameEventName, IGameComponent } from '../types.ts';

export type FeatureKey = 'inventory' | 'exp' | 'stats' | 'stage';

export interface UnlocksState {
  unlocked: FeatureKey[];
}

interface UnlockRule {
  feature: FeatureKey;
  event: GameEventName;
}

// A feature reveals the first time its trigger fact fires, so the player only
// meets each mechanic once it becomes relevant: exp on the first kill, stats on
// the first level-up's awarded point, inventory on the first drop, and the stage
// system once a boss becomes available.
const UNLOCK_RULES: UnlockRule[] = [
  { feature: 'exp', event: 'expGained' },
  { feature: 'stats', event: 'statsChanged' },
  { feature: 'inventory', event: 'inventoryUpdated' },
  { feature: 'stage', event: 'bossUnlocked' },
];

export class Unlocks implements IGameComponent {
  readonly id = 'unlocks';
  private gameContext!: GameContext;
  private state: UnlocksState = { unlocked: [] };

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    for (const rule of UNLOCK_RULES) {
      this.gameContext.on(rule.event, () => this.unlock(rule.feature));
    }
  }

  isUnlocked(feature: FeatureKey): boolean {
    return this.state.unlocked.includes(feature);
  }

  getState(): UnlocksState {
    return { unlocked: [...this.state.unlocked] };
  }

  save(): UnlocksState {
    return this.getState();
  }

  load(data: unknown): void {
    this.state = data as UnlocksState;
  }

  private unlock(feature: FeatureKey): void {
    if (this.isUnlocked(feature)) {
      return;
    }
    this.state.unlocked.push(feature);
    this.gameContext.emit('featureUnlocked', { feature });
  }
}
