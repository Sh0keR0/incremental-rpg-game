export const SAVE_VERSION = 1;

export interface SaveFile {
    version: number;
    savedAt: number;
    data: Record<string, unknown>;
}

export function serializeSave(data: Record<string, unknown>, savedAt: number): string {
    const saveFile: SaveFile = { version: SAVE_VERSION, savedAt, data };
    return JSON.stringify(saveFile);
}

// Returns the inner component blob ready for GameCore.load(), or null when the
// save is absent, corrupt, or from an unknown version. Never throws — a bad save
// should boot a fresh game, not crash it.
export function parseSave(raw: string | null): Record<string, unknown> | null {
    if (raw === null) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isSaveFile(parsed)) return null;

    const migrated = migrate(parsed);
    return migrated?.data ?? null;
}

function isSaveFile(value: unknown): value is SaveFile {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.version === 'number' &&
        typeof candidate.savedAt === 'number' &&
        typeof candidate.data === 'object' &&
        candidate.data !== null
    );
}

// Upgrade older save files to the current version. v1 is the baseline, so there
// is nothing to migrate yet; this is the seam for future schema changes. Returns
// null for versions we cannot understand (e.g. a future, newer save).
function migrate(saveFile: SaveFile): SaveFile | null {
    if (saveFile.version === SAVE_VERSION) return saveFile;
    return null;
}
