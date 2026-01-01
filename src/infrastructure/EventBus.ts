/**
 * Event Bus Implementation
 *
 * Provides a typed async event bus with priority ordering,
 * filtering, and timeout-based waiting.
 */

import {
  IEventBus,
  BaseEvent,
  EventHandler,
  SubscriptionOptions,
  EventSubscription,
  ILogger,
  Disposable,
} from '../types';

/** Handler entry with metadata */
interface HandlerEntry<T extends BaseEvent> {
  readonly id: string;
  readonly handler: EventHandler<T>;
  readonly priority: number;
  readonly filter?: (event: BaseEvent) => boolean;
  readonly once: boolean;
}

/**
 * Event Bus implementation with typed events
 */
export class EventBus implements IEventBus {
  private readonly handlers: Map<string, HandlerEntry<BaseEvent>[]> = new Map();
  private readonly logger?: ILogger;
  private handlerIdCounter = 0;

  constructor(logger?: ILogger) {
    this.logger = logger?.child('EventBus');
  }

  emit<T extends BaseEvent>(event: T): void;
  emit(type: string, data?: Record<string, unknown>): void;
  emit<T extends BaseEvent>(eventOrType: T | string, data?: Record<string, unknown>): void {
    // Handle string + data form
    const event: BaseEvent = typeof eventOrType === 'string'
      ? { type: eventOrType, timestamp: new Date(), ...data } as BaseEvent
      : eventOrType;

    const type = event.type;
    const entries = this.handlers.get(type);

    if (!entries || entries.length === 0) {
      this.logger?.debug(`No handlers for event type: ${type}`);
      return;
    }

    this.logger?.debug(`Emitting event: ${type}`, { handlerCount: entries.length });

    // Sort by priority (higher first)
    const sortedEntries = [...entries].sort((a, b) => b.priority - a.priority);

    // Track handlers to remove after execution (for once handlers)
    const handlersToRemove: string[] = [];

    for (const entry of sortedEntries) {
      // Apply filter if present
      if (entry.filter && !entry.filter(event)) {
        continue;
      }

      try {
        const result = entry.handler(event);

        // Handle async handlers
        if (result instanceof Promise) {
          result.catch((error) => {
            this.logger?.error(`Async handler error for event ${type}`, error as Error);
          });
        }
      } catch (error) {
        this.logger?.error(`Handler error for event ${type}`, error as Error);
      }

      // Mark once handlers for removal
      if (entry.once) {
        handlersToRemove.push(entry.id);
      }
    }

    // Remove once handlers
    if (handlersToRemove.length > 0) {
      this.removeHandlers(type, handlersToRemove);
    }
  }

  on<T extends BaseEvent>(
    type: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription {
    const id = this.generateHandlerId();
    const entry: HandlerEntry<BaseEvent> = {
      id,
      handler: handler as EventHandler<BaseEvent>,
      priority: options?.priority ?? 0,
      filter: options?.filter,
      once: false,
    };

    this.addHandler(type, entry);
    this.logger?.debug(`Subscribed to event: ${type}`, { handlerId: id });

    return this.createSubscription(type, id);
  }

  once<T extends BaseEvent>(type: string, handler: EventHandler<T>): EventSubscription {
    const id = this.generateHandlerId();
    const entry: HandlerEntry<BaseEvent> = {
      id,
      handler: handler as EventHandler<BaseEvent>,
      priority: 0,
      once: true,
    };

    this.addHandler(type, entry);
    this.logger?.debug(`Subscribed once to event: ${type}`, { handlerId: id });

    return this.createSubscription(type, id);
  }

  off(type: string): void {
    const count = this.handlers.get(type)?.length ?? 0;
    this.handlers.delete(type);
    this.logger?.debug(`Removed all handlers for event: ${type}`, { count });
  }

  async waitFor<T extends BaseEvent>(
    type: string,
    predicate?: (event: T) => boolean,
    timeout?: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      let subscription: EventSubscription | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        subscription?.dispose();
      };

      // Set up timeout if specified
      if (timeout !== undefined && timeout > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeout);
      }

      // Subscribe to the event
      subscription = this.on<T>(type, (event) => {
        // Check predicate if provided
        if (predicate && !predicate(event)) {
          return;
        }

        cleanup();
        resolve(event);
      });
    });
  }

  /**
   * Get the number of handlers for an event type
   */
  getHandlerCount(type: string): number {
    return this.handlers.get(type)?.length ?? 0;
  }

  /**
   * Get all registered event types
   */
  getEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    const typeCount = this.handlers.size;
    this.handlers.clear();
    this.logger?.debug('Cleared all event handlers', { typeCount });
  }

  private generateHandlerId(): string {
    return `handler_${++this.handlerIdCounter}`;
  }

  private addHandler(type: string, entry: HandlerEntry<BaseEvent>): void {
    const entries = this.handlers.get(type) ?? [];
    entries.push(entry);
    this.handlers.set(type, entries);
  }

  private removeHandlers(type: string, ids: string[]): void {
    const entries = this.handlers.get(type);
    if (!entries) return;

    const idSet = new Set(ids);
    const filtered = entries.filter((e) => !idSet.has(e.id));

    if (filtered.length === 0) {
      this.handlers.delete(type);
    } else {
      this.handlers.set(type, filtered);
    }
  }

  private createSubscription(type: string, handlerId: string): EventSubscription {
    let disposed = false;

    const subscription: EventSubscription = {
      eventType: type,
      dispose: () => {
        if (disposed) return;
        disposed = true;

        this.removeHandlers(type, [handlerId]);
        this.logger?.debug(`Unsubscribed from event: ${type}`, { handlerId });
      },
    };

    return subscription;
  }
}

/**
 * Create an event bus instance
 */
export function createEventBus(logger?: ILogger): IEventBus {
  return new EventBus(logger);
}

/**
 * Typed event factory helper
 */
export function createEvent<T extends BaseEvent>(
  type: T['type'],
  data: Omit<T, 'type' | 'timestamp'>
): T {
  return {
    type,
    timestamp: new Date(),
    ...data,
  } as T;
}

/**
 * Combine multiple disposables into one
 */
export function combineSubscriptions(...subscriptions: Disposable[]): Disposable {
  return {
    dispose: () => {
      for (const sub of subscriptions) {
        sub.dispose();
      }
    },
  };
}
