import {
    type FeatureKey,
    getNavigableStageId,
    getStageById,
    type GameSnapshot,
    type RebornState,
    type StagesState,
    type StatName,
    type UnlocksState,
} from '../game/index.ts';
import type { InventoryData } from '../game/components/Inventory.ts';

export const TEMPLATE = `
  <div class="game">
    <nav class="sidebar" role="tablist" aria-label="Game sections">
      <button class="nav-item active" type="button" role="tab" aria-selected="true" data-tab="combat">
        <span class="nav-icon">⚔</span>
        <span class="nav-label">Combat</span>
      </button>
      <button class="nav-item foldable" type="button" role="tab" aria-selected="false" data-tab="stats" data-feature="stats">
        <span class="nav-icon">↑</span>
        <span class="nav-label">Stats</span>
      </button>
      <button class="nav-item foldable" type="button" role="tab" aria-selected="false" data-tab="inventory" data-feature="inventory">
        <span class="nav-icon">▦</span>
        <span class="nav-label">Inventory</span>
      </button>
      <button class="nav-item foldable" type="button" role="tab" aria-selected="false" data-tab="reborn" data-feature="reborn">
        <span class="nav-icon">✦</span>
        <span class="nav-label">Reborn</span>
      </button>
      <button class="nav-item" type="button" role="tab" aria-selected="false" data-tab="settings">
        <span class="nav-icon">⚙</span>
        <span class="nav-label">Settings</span>
      </button>
    </nav>

    <main class="content">
      <div class="tab-panel active" role="tabpanel" data-panel="combat">
        <section class="stage-panel foldable" data-feature="stage">
          <div class="stage-selector">
            <button class="stage-arrow stage-prev" type="button" aria-label="Previous stage">‹</button>
            <h2 class="stage-name"></h2>
            <button class="stage-arrow stage-next" type="button" aria-label="Next stage">›</button>
          </div>
          <div class="stage-progress"></div>
        </section>
        <section class="enemy-panel">
          <p class="enemy-label">CURRENT ENEMY</p>
          <h2 class="enemy-name"></h2>
          <div class="bar hp-bar">
            <div class="bar-fill"></div>
            <span class="bar-label"></span>
          </div>
        </section>
        <div class="combat-actions">
          <button class="attack-btn" type="button">
            <span class="attack-label">ATTACK</span>
          </button>
          <button class="auto-attack-btn foldable" data-feature="autoAttack" type="button" aria-pressed="false">
            <span class="auto-attack-label">AUTO</span>
            <span class="attack-cooldown"></span>
          </button>
        </div>
        <button class="fight-boss-btn" type="button" hidden>FIGHT BOSS</button>
        <section class="player-panel foldable" data-feature="exp">
          <div class="player-level"></div>
          <div class="bar exp-bar">
            <div class="bar-fill"></div>
            <span class="bar-label"></span>
          </div>
        </section>
      </div>

      <div class="tab-panel" role="tabpanel" data-panel="stats">
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
      </div>

      <div class="tab-panel" role="tabpanel" data-panel="inventory">
        <section class="inventory-panel">
          <h3 class="inventory-title">Inventory</h3>
          <div id="inventory" class="inventory-grid"></div>
        </section>
      </div>

      <div class="tab-panel" role="tabpanel" data-panel="reborn">
        <section class="reborn-panel">
          <h3 class="reborn-title">Reborn <span class="remembrance-points"></span></h3>
          <button class="reborn-btn" type="button">Reborn</button>
          <div class="reborn-upgrades">
            <button class="reborn-upgrade-btn" data-upgrade="expMultiplier" type="button"></button>
            <button class="reborn-upgrade-btn" data-upgrade="attackMultiplier" type="button"></button>
            <button class="reborn-upgrade-btn" data-upgrade="cleave" type="button"></button>
          </div>
        </section>
      </div>
    </main>

    <div class="fx-layer" aria-hidden="true"></div>
  </div>

  <dialog class="settings-dialog" id="settings-dialog">
    <h2 class="settings-title">Settings</h2>
    <div class="settings-actions">
      <button class="new-game-btn" type="button">New Game</button>
      <button class="save-disk-btn" type="button">Save to File</button>
      <label class="load-disk-label">
        Load from File
        <input class="load-disk-input" type="file" accept=".json">
      </label>
    </div>
    <button class="dialog-close-btn" type="button">Close</button>
  </dialog>
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

    const autoAttackButton = root.querySelector<HTMLButtonElement>('.auto-attack-btn');
    if (autoAttackButton) {
        const { autoAttackEnabled, autoAttackCooldownRemainingMs, autoAttackCooldownMs } =
            state.combat;
        autoAttackButton.classList.toggle('active', autoAttackEnabled);
        autoAttackButton.setAttribute('aria-pressed', String(autoAttackEnabled));
        const label = autoAttackButton.querySelector<HTMLElement>('.auto-attack-label');
        if (label) label.textContent = `Auto-Attack: ${autoAttackEnabled ? 'On' : 'Off'}`;
        const cooldown = autoAttackButton.querySelector<HTMLElement>('.attack-cooldown');
        if (cooldown) {
            const remainingPercent =
                autoAttackEnabled && autoAttackCooldownMs > 0
                    ? (autoAttackCooldownRemainingMs / autoAttackCooldownMs) * 100
                    : 0;
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
    setBar(
        root,
        '.exp-bar',
        player.exp,
        player.expToNext,
        `${player.exp} / ${player.expToNext} EXP`,
    );

    applyUnlocks(root, state.unlocks);
}

function applyUnlocks(root: HTMLElement, unlocks: UnlocksState): void {
    for (const section of root.querySelectorAll<HTMLElement>('[data-feature]')) {
        const feature = section.dataset.feature as FeatureKey;
        section.classList.toggle('revealed', unlocks.unlocked.includes(feature));
    }
}

export function revealFeature(root: HTMLElement, feature: FeatureKey): void {
    root.querySelector<HTMLElement>(`[data-feature="${feature}"]`)?.classList.add('revealed');
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

export function renderReborn(root: HTMLElement, reborn: RebornState): void {
    const points = root.querySelector<HTMLElement>('.remembrance-points');
    if (points) points.textContent = `${reborn.remembrancePoints} RP`;

    const rebornButton = root.querySelector<HTMLButtonElement>('.reborn-btn');
    if (rebornButton) {
        rebornButton.disabled = !reborn.canReborn;
        rebornButton.textContent = reborn.canReborn
            ? `Reborn (+${reborn.pendingPoints} RP)`
            : 'Reborn';
    }

    setUpgradeButton(
        root,
        'expMultiplier',
        `EXP ×${reborn.expMultiplier.toFixed(2)} — ${reborn.expUpgradeCost} RP`,
        reborn.remembrancePoints >= reborn.expUpgradeCost,
        false,
    );
    setUpgradeButton(
        root,
        'attackMultiplier',
        `Attack ×${reborn.attackMultiplier.toFixed(2)} — ${reborn.attackUpgradeCost} RP`,
        reborn.remembrancePoints >= reborn.attackUpgradeCost,
        false,
    );
    const cleaveOwned = reborn.upgrades.cleave;
    setUpgradeButton(
        root,
        'cleave',
        cleaveOwned ? 'Cleave — owned' : `Cleave — ${reborn.cleaveCost} RP`,
        reborn.remembrancePoints >= reborn.cleaveCost,
        cleaveOwned,
    );
}

function setUpgradeButton(
    root: HTMLElement,
    upgrade: string,
    label: string,
    affordable: boolean,
    owned: boolean,
): void {
    const button = root.querySelector<HTMLButtonElement>(
        `.reborn-upgrade-btn[data-upgrade="${upgrade}"]`,
    );
    if (!button) return;
    button.textContent = label;
    button.disabled = owned || !affordable;
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
