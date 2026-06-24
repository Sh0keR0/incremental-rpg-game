import type { GameContext, GameEventName, IGameComponent } from '../types.ts';

export type FeatureKey = 'inventory';

export interface UnlocksState {
  unlocked: FeatureKey[];
}

interface UnlockRule {
  feature: FeatureKey;
  event: GameEventName;
}

const UNLOCK_RULES: UnlockRule[] = [{ feature: 'inventory', event: 'inventoryUpdated' }];

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
