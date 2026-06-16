import type { GameSnapshot } from '../game/index.ts';
import type { InventoryData } from '../game/components/Inventory.ts';

export const TEMPLATE = `
  <div class="game">
    <section class="enemy-panel">
      <h2 class="enemy-name"></h2>
      <div class="bar hp-bar">
        <div class="bar-fill"></div>
        <span class="bar-label"></span>
      </div>
    </section>
    <button class="attack-btn" type="button">Attack</button>
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

export function render(root: HTMLElement, state: GameSnapshot): void {
  const { player } = state;
  const enemy = state.combat.enemy;
  const name = root.querySelector<HTMLElement>('.enemy-name');
  if (name) name.textContent = enemy.name;
  setBar(root, '.hp-bar', enemy.hp, enemy.maxHp, `${enemy.hp} / ${enemy.maxHp} HP`);

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
