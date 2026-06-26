import {
  getNavigableStageId,
  getStageById,
  type GameSnapshot,
  type StagesState,
  type StatName,
} from '../game/index.ts';
import type { InventoryData } from '../game/components/Inventory.ts';

export const TEMPLATE = `
  <div class="game">
    <section class="stage-panel">
      <div class="stage-selector">
        <button class="stage-arrow stage-prev" type="button" aria-label="Previous stage">‹</button>
        <h2 class="stage-name"></h2>
        <button class="stage-arrow stage-next" type="button" aria-label="Next stage">›</button>
      </div>
      <div class="stage-progress"></div>
    </section>
    <section class="enemy-panel">
      <h2 class="enemy-name"></h2>
      <div class="bar hp-bar">
        <div class="bar-fill"></div>
        <span class="bar-label"></span>
      </div>
    </section>
    <button class="attack-btn" type="button">
      <span class="attack-label">Attack</span>
      <span class="attack-cooldown"></span>
    </button>
    <button class="fight-boss-btn" type="button" hidden>Fight Boss</button>
    <section class="player-panel">
      <div class="player-level"></div>
      <div class="bar exp-bar">
        <div class="bar-fill"></div>
        <span class="bar-label"></span>
      </div>
    </section>
    <section class="stats-panel">
      <h3 class="stats-title">Stats <span class="stats-points"></span></h3>
      <div class="stats-list">
        <div class="stat-row" data-stat="strength">
          <span class="stat-name">Strength</span>
          <span class="stat-value">0</span>
          <button class="stat-allocate-btn" type="button">+</button>
        </div>
        <div class="stat-row" data-stat="agility">
          <span class="stat-name">Agility</span>
          <span class="stat-value">0</span>
          <button class="stat-allocate-btn" type="button">+</button>
        </div>
        <div class="stat-row" data-stat="endurance">
          <span class="stat-name">Endurance</span>
          <span class="stat-value">0</span>
          <button class="stat-allocate-btn" type="button">+</button>
        </div>
      </div>
    </section>
    <section class="inventory-panel">
      <h3 class="inventory-title">Inventory</h3>
      <div id="inventory" class="inventory-grid">
<!--        ${Array.from({ length: 25 }, (_, index) => `<div data-inventory-slot="${index}" class="inventory-slot"></div>`).join('')}-->
      </div>
    </section>
    <div class="fx-layer" aria-hidden="true"></div>
  </div>
`;

function setBar(
  root: HTMLElement,
  selector: string,
  value: number,
  max: number,
  label: string,
): void {
  const bar = root.querySelector<HTMLElement>(selector);
  if (!bar) return;
  const fill = bar.querySelector<HTMLElement>('.bar-fill');
  const text = bar.querySelector<HTMLElement>('.bar-label');
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = label;
}

function renderStageSelector(root: HTMLElement, stages: StagesState): void {
  const canMove = stages.mode === 'normal';
  const prev = root.querySelector<HTMLButtonElement>('.stage-prev');
  if (prev) {
    prev.disabled =
      !canMove ||
      getNavigableStageId(stages.currentStageId, stages.unlockedStageIds, -1) === undefined;
  }
  const next = root.querySelector<HTMLButtonElement>('.stage-next');
  if (next) {
    next.disabled =
      !canMove ||
      getNavigableStageId(stages.currentStageId, stages.unlockedStageIds, 1) === undefined;
  }
}

function renderStageProgress(
  root: HTMLElement,
  stages: StagesState,
  killsToUnlockBoss: number,
): void {
  const progress = root.querySelector<HTMLElement>('.stage-progress');
  if (!progress) return;
  if (stages.mode === 'boss') {
    progress.textContent = `BOSS — ${Math.ceil(stages.bossTimeRemainingMs / 1000)}s`;
  } else if (stages.bossUnlocked) {
    progress.textContent = 'Boss ready!';
  } else {
    progress.textContent = `Kills: ${stages.kills} / ${killsToUnlockBoss}`;
  }
}

export function render(root: HTMLElement, state: GameSnapshot): void {
  const { player, stages } = state;
  const enemy = state.combat.enemy;
  const currentStage = getStageById(stages.currentStageId);

  const stageName = root.querySelector<HTMLElement>('.stage-name');
  if (stageName) stageName.textContent = currentStage?.name ?? '';
  renderStageSelector(root, stages);
  renderStageProgress(root, stages, currentStage?.killsToUnlockBoss ?? 0);

  const name = root.querySelector<HTMLElement>('.enemy-name');
  if (name) name.textContent = enemy.name;
  root.querySelector('.enemy-panel')?.classList.toggle('boss', state.combat.isBoss);
  setBar(root, '.hp-bar', enemy.hp, enemy.maxHp, `${enemy.hp} / ${enemy.maxHp} HP`);

  const attackButton = root.querySelector<HTMLButtonElement>('.attack-btn');
  if (attackButton) {
    const { attackCooldownRemainingMs, attackCooldownMs } = state.combat;
    attackButton.disabled = attackCooldownRemainingMs > 0;
    const cooldown = attackButton.querySelector<HTMLElement>('.attack-cooldown');
    if (cooldown) {
      const remainingPercent =
        attackCooldownMs > 0 ? (attackCooldownRemainingMs / attackCooldownMs) * 100 : 0;
      cooldown.style.width = `${Math.max(0, Math.min(100, remainingPercent))}%`;
    }
  }

  const fightBossButton = root.querySelector<HTMLButtonElement>('.fight-boss-btn');
  if (fightBossButton) {
    const canFightBoss = stages.bossUnlocked && stages.mode === 'normal';
    fightBossButton.hidden = !canFightBoss;
    fightBossButton.disabled = !canFightBoss;
  }

  const level = root.querySelector<HTMLElement>('.player-level');
  if (level) level.textContent = `Level ${player.level}`;
  setBar(root, '.exp-bar', player.exp, player.expToNext, `${player.exp} / ${player.expToNext} EXP`);
}

export function renderStats(root: HTMLElement, state: GameSnapshot): void {
  const { stats, unspentPoints } = state.stats;
  const pointsLabel = root.querySelector<HTMLElement>('.stats-points');
  if (pointsLabel) {
    pointsLabel.textContent = unspentPoints > 0 ? `(${unspentPoints} pts)` : '';
  }

  for (const statName of Object.keys(stats) as StatName[]) {
    const row = root.querySelector<HTMLElement>(`.stat-row[data-stat="${statName}"]`);
    if (!row) continue;
    const valueElement = row.querySelector<HTMLElement>('.stat-value');
    if (valueElement) valueElement.textContent = String(stats[statName]);
    const button = row.querySelector<HTMLButtonElement>('.stat-allocate-btn');
    if (button) button.disabled = unspentPoints <= 0;
  }
}

export function updateInventoryUI(inventoryData: InventoryData): void {
  const inventoryElement = document.getElementById('inventory');
  if (!inventoryElement) {
    return;
  }
  let html = '';
  for (let i = 0; i < inventoryData.slots.length; i++) {
    for (let j = 0; j < inventoryData.slots[i].length; j++) {
      html += `<div data-inventory-slot="[${i},${j}]" class="inventory-slot">${inventoryData.slots[i][j] ? 'I' : ''}</div>`;
    }
  }

  inventoryElement.innerHTML = html;
}
