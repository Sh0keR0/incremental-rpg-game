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

  game.subscribe((state) => render(view, state));
  game.on('attacked', (event) => floater(fxLayer, `-${event.damage}`, 'damage'));
  game.on('expGained', (event) => floater(fxLayer, `+${event.amount} EXP`, 'exp'));
  game.on('leveledUp', (event) => floater(fxLayer, `Level ${event.level}!`, 'levelup'));
  game.on('inventoryUpdated', (event) => updateInventoryUI(event.inventory));
  render(view, game.getState());
  updateInventoryUI(game.getState().inventory);
  game.start();
}
