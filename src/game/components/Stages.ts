import type { EnemyTemplate } from '../content/enemies.ts';
import { getNextStageId, getStageById, type StageDefinition, STAGES } from '../content/stages.ts';
import type { GameContext, IGameComponent } from '../types.ts';
import { Combat } from './Combat.ts';

export type StageMode = 'normal' | 'boss';

interface StageProgress {
  kills: number;
  bossUnlocked: boolean;
}

export interface StageOverview {
  id: string;
  name: string;
  unlocked: boolean;
  bossUnlocked: boolean;
  isCurrent: boolean;
}

export interface StagesState {
  currentStageId: string;
  currentStageName: string;
  kills: number;
  killsToUnlockBoss: number;
  bossUnlocked: boolean;
  mode: StageMode;
  bossTimeRemainingMs: number;
  bossTimeLimitMs: number;
  stages: StageOverview[];
  prevStageId?: string;
  nextStageId?: string;
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
  }

  onTick(dt: number): void {
    if (this.mode !== 'boss') return;
    this.bossTimeRemainingMs -= dt;
    if (this.bossTimeRemainingMs > 0) return;
    this.bossTimeRemainingMs = 0;
    this.mode = 'normal';
    this.gameContext.emit('bossFailed', { stageName: this.getCurrentStage().name });
    this.gameContext.getGameComponent(Combat).spawnNormalEnemy();
  }

  getCurrentStage(): StageDefinition {
    return getStageById(this.currentStageId) ?? STAGES[0];
  }

  getBossTemplate(): EnemyTemplate {
    return this.getCurrentStage().boss;
  }

  canFightBoss(): boolean {
    return this.mode === 'normal' && this.progressFor(this.currentStageId).bossUnlocked;
  }

  registerNormalKill(): void {
    const stage = this.getCurrentStage();
    const progress = this.progressFor(stage.id);
    if (progress.bossUnlocked) return;
    progress.kills += 1;
    if (progress.kills >= stage.killsToUnlockBoss) {
      progress.bossUnlocked = true;
      this.gameContext.emit('bossUnlocked', { stageName: stage.name });
    }
  }

  beginBossFight(): void {
    const stage = this.getCurrentStage();
    this.mode = 'boss';
    this.bossTimeRemainingMs = stage.bossTimeLimitMs;
    this.gameContext.emit('bossStarted', {
      name: stage.boss.name,
      maxHp: stage.boss.maxHp,
      timeLimitMs: stage.bossTimeLimitMs,
    });
  }

  completeBossFight(): void {
    this.mode = 'normal';
    const nextStageId = getNextStageId(this.currentStageId);
    if (nextStageId === undefined) return; // final stage cleared — stay put

    const nextStage = getStageById(nextStageId);
    if (nextStage === undefined) return;
    if (!this.unlockedStageIds.includes(nextStageId)) {
      this.unlockedStageIds.push(nextStageId);
      this.gameContext.emit('stageUnlocked', { stageId: nextStageId, stageName: nextStage.name });
    }
    this.currentStageId = nextStageId;
    this.gameContext.emit('stageSelected', { stageId: nextStageId, stageName: nextStage.name });
  }

  selectStage(stageId: string): boolean {
    if (this.mode !== 'normal') return false;
    if (!this.unlockedStageIds.includes(stageId)) return false;
    if (stageId === this.currentStageId) return false;
    this.currentStageId = stageId;
    const stage = getStageById(stageId);
    this.gameContext.emit('stageSelected', { stageId, stageName: stage?.name ?? '' });
    return true;
  }

  getState(): StagesState {
    const stage = this.getCurrentStage();
    const progress = this.progressByStageId[this.currentStageId];
    const kills = progress?.kills ?? 0;
    return {
      prevStageId: this.navigableNeighborId(-1),
      nextStageId: this.navigableNeighborId(1),
      currentStageId: stage.id,
      currentStageName: stage.name,
      kills: Math.min(kills, stage.killsToUnlockBoss),
      killsToUnlockBoss: stage.killsToUnlockBoss,
      bossUnlocked: progress?.bossUnlocked ?? false,
      mode: this.mode,
      bossTimeRemainingMs: this.bossTimeRemainingMs,
      bossTimeLimitMs: stage.bossTimeLimitMs,
      stages: STAGES.map((definition) => ({
        id: definition.id,
        name: definition.name,
        unlocked: this.unlockedStageIds.includes(definition.id),
        bossUnlocked: this.progressByStageId[definition.id]?.bossUnlocked ?? false,
        isCurrent: definition.id === this.currentStageId,
      })),
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
    if (!this.unlockedStageIds.includes(STAGES[0].id)) {
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

  private navigableNeighborId(offset: number): string | undefined {
    if (this.mode !== 'normal') return undefined;
    const currentIndex = STAGES.findIndex((stage) => stage.id === this.currentStageId);
    const neighbor = STAGES[currentIndex + offset];
    if (!neighbor || !this.unlockedStageIds.includes(neighbor.id)) return undefined;
    return neighbor.id;
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
