import type { Game } from '../game/index.ts';
import { render, TEMPLATE, updateInventoryUI } from './render.ts';

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
  root.querySelector<HTMLElement>('.stage-selector')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-stage-id]');
    if (button) game.actions.selectStage(button.dataset.stageId ?? '');
  });

  game.subscribe((state) => render(view, state));
  game.on('attacked', (event) => floater(fxLayer, `-${event.damage}`, 'damage'));
  game.on('expGained', (event) => floater(fxLayer, `+${event.amount} EXP`, 'exp'));
  game.on('leveledUp', (event) => floater(fxLayer, `Level ${event.level}!`, 'levelup'));
  game.on('inventoryUpdated', (event) => updateInventoryUI(event.inventory));
  game.on('bossUnlocked', () => floater(fxLayer, 'Boss unlocked!', 'levelup'));
  game.on('bossFailed', () => floater(fxLayer, 'Boss escaped!', 'damage'));
  game.on('stageUnlocked', (event) => floater(fxLayer, `${event.stageName} unlocked!`, 'levelup'));
  render(view, game.getState());
  updateInventoryUI(game.getState().inventory);
  game.start();
}
