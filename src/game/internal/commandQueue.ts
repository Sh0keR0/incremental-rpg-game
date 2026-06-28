import type { GameCommandMap, GameCommandName } from '../types.ts';

type AnyCommandHandler = (payload: unknown) => void;

interface PendingCommand {
    name: GameCommandName;
    payload: unknown;
}

export class CommandQueue {
    private readonly handlers = new Map<GameCommandName, AnyCommandHandler>();
    private readonly pending: PendingCommand[] = [];

    handle<K extends GameCommandName>(
        name: K,
        handler: (payload: GameCommandMap[K]) => void,
    ): void {
        if (this.handlers.has(name)) {
            throw new Error(`Command already has a handler: ${name}`);
        }
        this.handlers.set(name, handler as AnyCommandHandler);
    }

    enqueue<K extends GameCommandName>(name: K, payload: GameCommandMap[K]): void {
        this.pending.push({ name, payload });
    }

    // Resolve handlers at drain time, not enqueue time, so a command can be
    // queued before its component has registered (handlers register in initialize).
    drain(): void {
        const commands = this.pending.splice(0);
        for (const command of commands) {
            const handler = this.handlers.get(command.name);
            if (!handler) {
                throw new Error(`No handler registered for command: ${command.name}`);
            }
            handler(command.payload);
        }
    }
}
