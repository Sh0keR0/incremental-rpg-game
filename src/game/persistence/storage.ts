export interface SaveStorage {
  read(): string | null;
  write(raw: string): void;
  clear(): void;
}

const DEFAULT_SAVE_KEY = 'incremental-rpg-save';

// localStorage can throw in private mode or when over quota; persistence is
// best-effort, so failures are swallowed rather than crashing the game loop.
export function createLocalStorageAdapter(key = DEFAULT_SAVE_KEY): SaveStorage {
  return {
    read() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(raw) {
      try {
        localStorage.setItem(key, raw);
      } catch {
        // ignore: nothing actionable if persistence is unavailable
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function createMemoryStorage(initial: string | null = null): SaveStorage {
  let value = initial;
  return {
    read: () => value,
    write: (raw) => {
      value = raw;
    },
    clear: () => {
      value = null;
    },
  };
}
