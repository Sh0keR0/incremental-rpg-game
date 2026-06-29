import {
    getNavigableStageId,
    getStageById,
    type Game,
    type RebornUpgradeKey,
    type StatName,
} from '../game/index.ts';
import {
    render,
    renderReborn,
    renderStats,
    revealFeature,
    TEMPLATE,
    updateInventoryUI,
} from './render.ts';

const AUTOSAVE_INTERVAL_MS = 10_000;

function floater(layer: HTMLElement, text: string, className: string): void {
    const element = document.createElement('div');
    element.className = `floater ${className}`;
    element.textContent = text;
    element.addEventListener('animationend', () => element.remove());
    layer.append(element);
}

function activateTab(view: HTMLElement, tab: string): void {
    for (const item of view.querySelectorAll<HTMLElement>('.nav-item')) {
        const isActive = item.dataset.tab === tab;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', String(isActive));
    }
    for (const panel of view.querySelectorAll<HTMLElement>('.tab-panel')) {
        panel.classList.toggle('active', panel.dataset.panel === tab);
    }
}

export function mountUI(game: Game, root: HTMLElement): void {
    root.innerHTML = TEMPLATE;
    const view = root.querySelector<HTMLElement>('.game');
    const fxLayer = root.querySelector<HTMLElement>('.fx-layer');
    if (!view || !fxLayer) throw new Error('UI template failed to mount');

    // Tab navigation
    for (const item of view.querySelectorAll<HTMLElement>('.nav-item:not([data-tab="settings"])')) {
        const tab = item.dataset.tab;
        if (tab) item.addEventListener('click', () => activateTab(view, tab));
    }

    // Settings dialog
    const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog');
    if (!dialog) throw new Error('Settings dialog not found');

    view.querySelector('.nav-item[data-tab="settings"]')?.addEventListener('click', () => {
        dialog.showModal();
    });
    dialog.querySelector('.dialog-close-btn')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });

    dialog.querySelector('.new-game-btn')?.addEventListener('click', () => {
        if (!confirm('Reset all progress and start a new game?')) return;
        game.resetGame();
    });

    dialog.querySelector('.save-disk-btn')?.addEventListener('click', () => {
        const data = game.exportSave();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'rpg-save.json';
        link.click();
        URL.revokeObjectURL(url);
    });

    const fileInput = dialog.querySelector<HTMLInputElement>('.load-disk-input');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const ok = game.importSave(reader.result as string);
                fileInput.value = '';
                if (ok) {
                    location.reload();
                } else {
                    alert('Invalid or incompatible save file.');
                }
            };
            reader.readAsText(file);
        });
    }

    // Combat actions
    root.querySelector<HTMLButtonElement>('.attack-btn')?.addEventListener('click', () => {
        game.actions.attack();
    });
    root.querySelector<HTMLButtonElement>('.auto-attack-btn')?.addEventListener('click', () => {
        game.actions.toggleAutoAttack();
    });
    root.querySelector<HTMLButtonElement>('.fight-boss-btn')?.addEventListener('click', () => {
        game.actions.fightBoss();
    });
    root.querySelector<HTMLButtonElement>('.stage-prev')?.addEventListener('click', () => {
        const { stages } = game.getState();
        const target = getNavigableStageId(stages.currentStageId, stages.unlockedStageIds, -1);
        if (target) game.actions.selectStage(target);
    });
    root.querySelector<HTMLButtonElement>('.stage-next')?.addEventListener('click', () => {
        const { stages } = game.getState();
        const target = getNavigableStageId(stages.currentStageId, stages.unlockedStageIds, 1);
        if (target) game.actions.selectStage(target);
    });

    root.querySelector<HTMLButtonElement>('.reborn-btn')?.addEventListener('click', () => {
        if (!confirm('Reborn? This resets your level, stats, and stage progress.')) return;
        game.actions.reborn();
    });
    for (const button of view.querySelectorAll<HTMLButtonElement>('.reborn-upgrade-btn')) {
        const upgrade = button.dataset.upgrade as RebornUpgradeKey | undefined;
        if (upgrade) {
            button.addEventListener('click', () => game.actions.buyRebornUpgrade(upgrade));
        }
    }

    for (const button of view.querySelectorAll<HTMLButtonElement>('.stat-allocate-btn')) {
        const statName = button.closest<HTMLElement>('.stat-row')?.dataset.stat as
            | StatName
            | undefined;
        if (statName) {
            button.addEventListener('click', () => game.actions.allocateStat(statName));
        }
    }

    game.subscribe((state) => {
        render(view, state);
        renderStats(view, state);
        renderReborn(view, state.reborn);
    });
    game.on('attacked', (event) => floater(fxLayer, `-${event.damage}`, 'damage'));
    game.on('expGained', (event) => floater(fxLayer, `+${event.amount} EXP`, 'exp'));
    game.on('leveledUp', (event) => floater(fxLayer, `Level ${event.level}!`, 'levelup'));
    game.on('inventoryUpdated', (event) => updateInventoryUI(event.inventory));
    game.on('featureUnlocked', (event) => revealFeature(view, event.feature));
    game.on('bossUnlocked', () => floater(fxLayer, 'Boss unlocked!', 'levelup'));
    game.on('bossFailed', () => floater(fxLayer, 'Boss escaped!', 'damage'));
    game.on('stageUnlocked', (event) =>
        floater(
            fxLayer,
            `${getStageById(event.stageId)?.name ?? 'New stage'} unlocked!`,
            'levelup',
        ),
    );
    game.on('rebornCompleted', (event) =>
        floater(fxLayer, `Reborn! +${event.pointsAwarded} RP`, 'levelup'),
    );
    game.on('rebornUpgradePurchased', (event) =>
        floater(fxLayer, `${event.upgrade} → ${event.level}`, 'levelup'),
    );
    game.load();
    const initialState = game.getState();
    render(view, initialState);
    renderStats(view, initialState);
    renderReborn(view, initialState.reborn);
    updateInventoryUI(initialState.inventory);

    setInterval(() => game.save(), AUTOSAVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') game.save();
    });
    window.addEventListener('beforeunload', () => game.save());

    game.start();
}
