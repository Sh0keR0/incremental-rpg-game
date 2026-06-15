export interface LevelProgress {
  level: number;
  exp: number;
  expToNext: number;
}

export interface LevelResult extends LevelProgress {
  levelsGained: number[];
}

export function expForLevel(level: number): number {
  return Math.floor(10 * level * 1.5);
}

export function applyExp(progress: LevelProgress, amount: number): LevelResult {
  let level = progress.level;
  let exp = progress.exp + amount;
  let expToNext = progress.expToNext;
  const levelsGained: number[] = [];

  while (exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = expForLevel(level);
    levelsGained.push(level);
  }

  return { level, exp, expToNext, levelsGained };
}
