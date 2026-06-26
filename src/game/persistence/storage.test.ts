import { describe, expect, test } from 'vitest';
import { createMemoryStorage } from './storage.ts';

describe('createMemoryStorage', () => {
  test('reads back what was written', () => {
    const storage = createMemoryStorage();
    expect(storage.read()).toBeNull();
    storage.write('payload');
    expect(storage.read()).toBe('payload');
  });

  test('clear removes the stored value', () => {
    const storage = createMemoryStorage('seed');
    expect(storage.read()).toBe('seed');
    storage.clear();
    expect(storage.read()).toBeNull();
  });
});
