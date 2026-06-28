export interface DroppableItem {
    itemId: string;
    chance: number;
}

export interface Enemy {
    name: string;
    hp: number;
    maxHp: number;
    expReward: number;
    drops: DroppableItem[];
}

export interface EnemyTemplate {
    name: string;
    maxHp: number;
    expReward: number;
    drops: DroppableItem[];
}

export function instantiateEnemy(template: EnemyTemplate): Enemy {
    return {
        name: template.name,
        hp: template.maxHp,
        maxHp: template.maxHp,
        expReward: template.expReward,
        drops: template.drops,
    };
}
