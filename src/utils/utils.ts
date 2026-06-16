export function findFirstAvailable<T>(grid: (T | undefined)[][]): [number, number] | null {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === undefined) {
        return [row, col];
      }
    }
  }
  return null;
}
