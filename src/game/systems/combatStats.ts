export const STRENGTH_DAMAGE_PER_POINT = 2;
export const BASE_ATTACK_COOLDOWN_MS = 1000;
export const AGILITY_COOLDOWN_FACTOR = 0.1;
export const ENDURANCE_BOSS_TIME_PER_POINT_MS = 1000;

export function attackDamage(baseAttack: number, strength: number): number {
    return baseAttack + strength * STRENGTH_DAMAGE_PER_POINT;
}

// Diminishing returns so attack speed keeps scaling without ever reaching zero:
// 1000ms at 0 agility, 500ms at 10. No hard floor needed.
export function attackCooldownMs(agility: number): number {
    return BASE_ATTACK_COOLDOWN_MS / (1 + agility * AGILITY_COOLDOWN_FACTOR);
}

export function bossTimeLimitMs(baseLimitMs: number, endurance: number): number {
    return baseLimitMs + endurance * ENDURANCE_BOSS_TIME_PER_POINT_MS;
}
