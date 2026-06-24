import type { GameSnapshot, StagesState } from '../game/index.ts';
import type { InventoryData } from '../game/components/Inventory.ts';

export const TEMPLATE = `
  <div class="game">
    <section class="stage-panel">
      <div class="stage-selector"></div>
      <h2 class="stage-name"></h2>
      <div class="stage-progress"></div>
    </section>
    <section class="enemy-panel">
      <h2 class="enemy-name"></h2>
      <div class="bar hp-bar">
        <div class="bar-fill"></div>
        <span class="bar-label"></span>
      </div>
    </section>
    <button class="attack-btn" type="button">Attack</button>
    <button class="fight-boss-btn" type="button" hidden>Fight Boss</button>
    <section class="player-panel">
      <div class="player-level"></div>
      <div class="bar exp-bar">
        <div class="bar-fill"></div>
        <span class="bar-label"></span>
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
  const container = root.querySelector<HTMLElement>('.stage-selector');
  if (!container) return;
  if (container.childElementCount !== stages.stages.length) {
    container.innerHTML = stages.stages
      .map(
        (stage) => `<button class="stage-btn" type="button" data-stage-id="${stage.id}"></button>`,
      )
      .join('');
  }
  const buttons = container.querySelectorAll<HTMLButtonElement>('.stage-btn');
  stages.stages.forEach((stage, index) => {
    const button = buttons[index];
    if (!button) return;
    button.textContent = stage.unlocked ? stage.name : 'Locked';
    button.disabled = !stage.unlocked || stages.mode === 'boss';
    button.classList.toggle('current', stage.isCurrent);
  });
}

function renderStageProgress(root: HTMLElement, stages: StagesState): void {
  const progress = root.querySelector<HTMLElement>('.stage-progress');
  if (!progress) return;
  if (stages.mode === 'boss') {
    progress.textContent = `BOSS — ${Math.ceil(stages.bossTimeRemainingMs / 1000)}s`;
  } else if (stages.bossUnlocked) {
    progress.textContent = 'Boss ready!';
  } else {
    progress.textContent = `Kills: ${stages.kills} / ${stages.killsToUnlockBoss}`;
  }
}

export function render(root: HTMLElement, state: GameSnapshot): void {
  const { player, stages } = state;
  const enemy = state.combat.enemy;

  const stageName = root.querySelector<HTMLElement>('.stage-name');
  if (stageName) stageName.textContent = stages.currentStageName;
  renderStageSelector(root, stages);
  renderStageProgress(root, stages);

  const name = root.querySelector<HTMLElement>('.enemy-name');
  if (name) name.textContent = enemy.name;
  root.querySelector('.enemy-panel')?.classList.toggle('boss', state.combat.isBoss);
  setBar(root, '.hp-bar', enemy.hp, enemy.maxHp, `${enemy.hp} / ${enemy.maxHp} HP`);

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
