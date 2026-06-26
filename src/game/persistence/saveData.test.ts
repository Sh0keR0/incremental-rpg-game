import { describe, expect, test } from 'vitest';
import { parseSave, SAVE_VERSION, serializeSave } from './saveData.ts';

describe('saveData', () => {
  test('round-trips an arbitrary component blob', () => {
    const data = { player: { level: 3, exp: 12 }, stages: { currentStageId: 'forest' } };
    const restored = parseSave(serializeSave(data, 1000));
    expect(restored).toEqual(data);
  });

  test('embeds the current version and timestamp', () => {
    const serialized = serializeSave({ player: {} }, 42);
    expect(JSON.parse(serialized)).toEqual({
      version: SAVE_VERSION,
      savedAt: 42,
      data: { player: {} },
    });
  });

  test('returns null when there is no save', () => {
    expect(parseSave(null)).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseSave('{not valid json')).toBeNull();
  });

  test('returns null when the version field is missing', () => {
    expect(parseSave(JSON.stringify({ savedAt: 1, data: {} }))).toBeNull();
  });

  test('returns null for an unknown future version', () => {
    expect(
      parseSave(JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, data: {} })),
    ).toBeNull();
  });

  test('returns null when data is not an object', () => {
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 1, data: null }))).toBeNull();
  });
});
