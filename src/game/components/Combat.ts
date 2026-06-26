import { type DroppableItem, type Enemy, instantiateEnemy } from '../content/enemies.ts';
import { spawnStageEnemy, STAGES } from '../content/stages.ts';
import { attackCooldownMs, attackDamage } from '../systems/combatStats.ts';
import type { GameContext, IGameComponent } from '../types.ts';
import { Player } from './Player.ts';
import { PlayerStats } from './PlayerStats.ts';
import { Stages } from './Stages.ts';

export interface CombatState {
  enemy: Enemy;
  isBoss: boolean;
  attackCooldownRemainingMs: number;
  attackCooldownMs: number;
}

export class Combat implements IGameComponent {
  readonly id = 'combat';
  private gameContext!: GameContext;
  private enemy!: Enemy;
  private currentEnemyIsBoss = false;
  private attackCooldownRemainingMs = 0;

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    this.enemy = spawnStageEnemy(STAGES[0], gameContext.rng);
    gameContext.handle('attack', () => this.attemptAttack());
    // Spawning follows the stage facts: the boss appears when the fight starts,
    // and a normal enemy returns whenever the active stage changes or a boss
    // fight is abandoned.
    gameContext.on('bossStarted', () => this.spawnBoss());
    gameContext.on('bossFailed', () => this.spawnNormalEnemy());
    gameContext.on('stageSelected', () => this.spawnNormalEnemy());
  }

  onTick(deltaMs: number): void {
    if (this.attackCooldownRemainingMs > 0) {
      this.attackCooldownRemainingMs = Math.max(0, this.attackCooldownRemainingMs - deltaMs);
    }
  }

  private attemptAttack(): void {
    if (this.attackCooldownRemainingMs > 0) return;
    const playerStats = this.gameContext.getGameComponent(PlayerStats);
    const baseAttack = this.gameContext.getGameComponent(Player).getAttack();
    this.attackCooldownRemainingMs = attackCooldownMs(playerStats.getStat('agility'));
    this.damageEnemy(attackDamage(baseAttack, playerStats.getStat('strength')));
  }

  damageEnemy(amount: number): void {
    const remainingHp = Math.max(0, this.enemy.hp - amount);
    this.enemy = { ...this.enemy, hp: remainingHp };
    this.gameContext.emit('attacked', {
      damage: amount,
      enemyHp: remainingHp,
      enemyName: this.enemy.name,
    });
    if (remainingHp > 0) return;
    this.defeatEnemy();
  }

  private spawnNormalEnemy(): void {
    const stage = this.gameContext.getGameComponent(Stages).getCurrentStage();
    this.enemy = spawnStageEnemy(stage, this.gameContext.rng);
    this.currentEnemyIsBoss = false;
    this.gameContext.emit('enemySpawned', { name: this.enemy.name, maxHp: this.enemy.maxHp });
  }

  private spawnBoss(): void {
    this.enemy = instantiateEnemy(this.gameContext.getGameComponent(Stages).getBossTemplate());
    this.currentEnemyIsBoss = true;
    this.gameContext.emit('enemySpawned', { name: this.enemy.name, maxHp: this.enemy.maxHp });
  }

  private defeatEnemy() {
    // Announce the fact; Stages reacts synchronously (advancing the stage on a
    // boss kill) before we read the current stage to spawn the next enemy.
    this.gameContext.emit('enemyDefeated', {
      name: this.enemy.name,
      expReward: this.enemy.expReward,
      drops: this.rollDrops(),
      isBoss: this.currentEnemyIsBoss,
    });
    this.spawnNormalEnemy();
  }

  private rollDrops(): DroppableItem[] {
    const drops: DroppableItem[] = [];
    for (const droppable of this.enemy.drops) {
      if (this.gameContext.rng() <= droppable.chance) {
        drops.push(droppable);
      }
    }
    return drops;
  }

  getState(): CombatState {
    const agility = this.gameContext.getGameComponent(PlayerStats).getStat('agility');
    return {
      enemy: { ...this.enemy },
      isBoss: this.currentEnemyIsBoss,
      attackCooldownRemainingMs: this.attackCooldownRemainingMs,
      attackCooldownMs: attackCooldownMs(agility),
    };
  }

  save(): unknown {
    return { enemy: this.enemy, isBoss: this.currentEnemyIsBoss };
  }

  load(data: unknown): void {
    const saved = data as { enemy: Enemy; isBoss?: boolean };
    this.enemy = saved.enemy;
    this.currentEnemyIsBoss = saved.isBoss ?? false;
  }
}
