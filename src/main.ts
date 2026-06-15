import { createGame } from './game';
import './style.css';
import { mountUI } from './ui';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

const game = createGame();
mountUI(game, root);
