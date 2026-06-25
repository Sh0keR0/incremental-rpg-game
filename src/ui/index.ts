import type { Game, StatName } from '../game/index.ts';
import { render, renderStats, TEMPLATE, updateInventoryUI } from './render.ts';

function floater(layer: HTMLElement, text: string, className: string): void {
  const element = document.createElement('div');
  element.className = `floater ${className}`;
  element.textContent = text;
  element.addEventListener('animationend', () => element.remove());
  layer.append(element);
}

export function mountUI(game: Game, root: HTMLElement): void {
  root.innerHTML = TEMPLATE;
  const view = root.querySelector<HTMLElement>('.game');
  const fxLayer = root.querySelector<HTMLElement>('.fx-layer');
  if (!view || !fxLayer) throw new Error('UI template failed to mount');

  root.querySelector<HTMLButtonElement>('.attack-btn')?.addEventListener('click', () => {
    game.actions.attack();
  });
  root.querySelector<HTMLButtonElement>('.fight-boss-btn')?.addEventListener('click', () => {
    game.actions.fightBoss();
  });
  root.querySelector<HTMLButtonElement>('.stage-prev')?.addEventListener('click', () => {
    const target = game.getState().stages.prevStageId;
    if (target) game.actions.selectStage(target);
  });
  root.querySelector<HTMLButtonElement>('.stage-next')?.addEventListener('click', () => {
    const target = game.getState().stages.nextStageId;
    if (target) game.actions.selectStage(target);
  });

  for (const button of view.querySelectorAll<HTMLButtonElement>('.stat-allocate-btn')) {
    const statName = button.closest<HTMLElement>('.stat-row')?.dataset.stat as StatName | undefined;
    if (statName) {
      button.addEventListener('click', () => game.actions.allocateStat(statName));
    }
  }

  game.subscribe((state) => {
    render(view, state);
    renderStats(view, state);
  });
  game.on('attacked', (event) => floater(fxLayer, `-${event.damage}`, 'damage'));
  game.on('expGained', (event) => floater(fxLayer, `+${event.amount} EXP`, 'exp'));
  game.on('leveledUp', (event) => floater(fxLayer, `Level ${event.level}!`, 'levelup'));
  game.on('inventoryUpdated', (event) => updateInventoryUI(event.inventory));
  game.on('bossUnlocked', () => floater(fxLayer, 'Boss unlocked!', 'levelup'));
  game.on('bossFailed', () => floater(fxLayer, 'Boss escaped!', 'damage'));
  game.on('stageUnlocked', (event) => floater(fxLayer, `${event.stageName} unlocked!`, 'levelup'));
  const initialState = game.getState();
  render(view, initialState);
  renderStats(view, initialState);
  updateInventoryUI(initialState.inventory);
  game.start();
}
