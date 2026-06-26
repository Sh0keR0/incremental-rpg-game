import type { EnemyTemplate } from '../content/enemies.ts';
import { getNextStage, getStageById, type StageDefinition, STAGES } from '../content/stages.ts';
import type { GameContext, IGameComponent } from '../types.ts';

export type StageMode = 'normal' | 'boss';

interface StageProgress {
  kills: number;
  bossUnlocked: boolean;
}

// Dynamic stage progress only. Static content (names, thresholds, ordering)
// lives in content/stages.ts; the UI composes the two. `kills` is capped at the
// current stage's unlock threshold so callers never see e.g. 7/5.
export interface StagesState {
  currentStageId: string;
  unlockedStageIds: string[];
  kills: number;
  bossUnlocked: boolean;
  mode: StageMode;
  bossTimeRemainingMs: number;
}

export class Stages implements IGameComponent {
  readonly id = 'stages';
  private gameContext!: GameContext;
  private currentStageId: string = STAGES[0].id;
  private unlockedStageIds: string[] = [STAGES[0].id];
  private progressByStageId: Record<string, StageProgress> = {};
  private mode: StageMode = 'normal';
  private bossTimeRemainingMs = 0;

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    gameContext.on('enemyDefeated', ({ isBoss }) => {
      if (isBoss) this.completeBossFight();
      else this.registerNormalKill();
    });
    gameContext.handle('fightBoss', () => {
      if (this.canFightBoss()) this.beginBossFight();
    });
    gameContext.handle('selectStage', ({ stageId }) => {
      this.selectStage(stageId);
    });
  }

  onTick(dt: number): void {
    if (this.mode !== 'boss') return;
    this.bossTimeRemainingMs -= dt;
    if (this.bossTimeRemainingMs > 0) return;
    this.bossTimeRemainingMs = 0;
    this.mode = 'normal';
    // Combat reacts to bossFailed by returning the player to a normal enemy.
    this.gameContext.emit('bossFailed', { stageId: this.currentStageId });
  }

  getCurrentStage(): StageDefinition {
    return getStageById(this.currentStageId) ?? STAGES[0];
  }

  getBossTemplate(): EnemyTemplate {
    return this.getCurrentStage().boss;
  }

  canFightBoss(): boolean {
    return this.mode === 'normal' && this.isBossUnlocked(this.currentStageId);
  }

  private registerNormalKill(): void {
    const stage = this.getCurrentStage();
    const progress = this.progressFor(stage.id);
    if (progress.bossUnlocked) return;
    progress.kills += 1;
    if (progress.kills >= stage.killsToUnlockBoss) {
      progress.bossUnlocked = true;
      this.gameContext.emit('bossUnlocked', { stageId: stage.id });
    }
  }

  private beginBossFight(): void {
    const stage = this.getCurrentStage();
    this.mode = 'boss';
    this.bossTimeRemainingMs = stage.bossTimeLimitMs;
    this.gameContext.emit('bossStarted', { stageId: stage.id });
  }

  private completeBossFight(): void {
    this.mode = 'normal';
    const nextStage = getNextStage(this.currentStageId);
    if (nextStage === undefined) return; // final stage cleared — stay put

    if (!this.isUnlocked(nextStage.id)) {
      this.unlockedStageIds.push(nextStage.id);
      this.gameContext.emit('stageUnlocked', { stageId: nextStage.id });
    }
    // Switch to the new stage but don't emit stageSelected: Combat already
    // spawns the next enemy itself after the enemyDefeated fact that drove this
    // boss completion, and it reads the updated current stage here.
    this.currentStageId = nextStage.id;
  }

  selectStage(stageId: string): boolean {
    if (this.mode !== 'normal') return false;
    if (!this.isUnlocked(stageId)) return false;
    if (stageId === this.currentStageId) return false;
    this.currentStageId = stageId;
    this.gameContext.emit('stageSelected', { stageId });
    return true;
  }

  getState(): StagesState {
    const stage = this.getCurrentStage();
    const kills = this.progressByStageId[this.currentStageId]?.kills ?? 0;
    return {
      currentStageId: stage.id,
      unlockedStageIds: [...this.unlockedStageIds],
      kills: Math.min(kills, stage.killsToUnlockBoss),
      bossUnlocked: this.isBossUnlocked(stage.id),
      mode: this.mode,
      bossTimeRemainingMs: this.bossTimeRemainingMs,
    };
  }

  save(): unknown {
    return {
      currentStageId: this.currentStageId,
      unlockedStageIds: this.unlockedStageIds,
      progressByStageId: this.progressByStageId,
      mode: this.mode,
      bossTimeRemainingMs: this.bossTimeRemainingMs,
    };
  }

  load(data: unknown): void {
    const saved = (data ?? {}) as Partial<{
      currentStageId: string;
      unlockedStageIds: string[];
      progressByStageId: Record<string, StageProgress>;
      mode: StageMode;
      bossTimeRemainingMs: number;
    }>;
    const validIds = new Set(STAGES.map((stage) => stage.id));

    this.unlockedStageIds = (saved.unlockedStageIds ?? []).filter((stageId) =>
      validIds.has(stageId),
    );
    if (!this.isUnlocked(STAGES[0].id)) {
      this.unlockedStageIds.unshift(STAGES[0].id);
    }

    this.progressByStageId = {};
    for (const [stageId, progress] of Object.entries(saved.progressByStageId ?? {})) {
      if (validIds.has(stageId)) this.progressByStageId[stageId] = { ...progress };
    }

    this.currentStageId =
      saved.currentStageId && this.unlockedStageIds.includes(saved.currentStageId)
        ? saved.currentStageId
        : STAGES[0].id;
    this.mode = saved.mode === 'boss' ? 'boss' : 'normal';
    this.bossTimeRemainingMs = saved.bossTimeRemainingMs ?? 0;
  }

  private isUnlocked(stageId: string): boolean {
    return this.unlockedStageIds.includes(stageId);
  }

  private isBossUnlocked(stageId: string): boolean {
    return this.progressByStageId[stageId]?.bossUnlocked ?? false;
  }

  private progressFor(stageId: string): StageProgress {
    let progress = this.progressByStageId[stageId];
    if (!progress) {
      progress = { kills: 0, bossUnlocked: false };
      this.progressByStageId[stageId] = progress;
    }
    return progress;
  }
}
