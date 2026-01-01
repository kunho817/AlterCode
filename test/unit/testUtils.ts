/**
 * Shared Test Utilities
 *
 * Common mocks and helpers for unit tests.
 */

import {
  IEventBus,
  IFileSystem,
  EventSubscription,
  FilePath,
  VirtualBranchId,
  AgentId,
  TaskId,
  MissionId,
  LineNumber,
  RelativePath,
} from '../../src/types';

/**
 * Create a mock EventBus that satisfies the IEventBus interface
 */
export function createMockEventBus(): IEventBus & { emittedEvents: Array<{ event: string; payload: unknown }> } {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emittedEvents: Array<{ event: string; payload: unknown }> = [];

  const createSubscription = (eventType: string, handler: (payload: unknown) => void): EventSubscription => ({
    eventType,
    dispose: () => {
      listeners.get(eventType)?.delete(handler);
    },
  });

  return {
    emittedEvents,
    emit: jest.fn((...args: unknown[]) => {
      // Handle both emit(event: T) and emit(type: string, data?: Record<string, unknown>)
      let eventType: string;
      let payload: unknown;

      if (typeof args[0] === 'string') {
        eventType = args[0];
        payload = args[1] ?? {};
      } else {
        // Event object with type property
        const event = args[0] as { type: string };
        eventType = event.type;
        payload = event;
      }

      emittedEvents.push({ event: eventType, payload });
      const handlers = listeners.get(eventType);
      if (handlers) {
        handlers.forEach((handler) => handler(payload));
      }
    }) as IEventBus['emit'],

    on: jest.fn(<T>(type: string, handler: (event: T) => void): EventSubscription => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      const wrappedHandler = handler as (payload: unknown) => void;
      listeners.get(type)!.add(wrappedHandler);
      return createSubscription(type, wrappedHandler);
    }) as IEventBus['on'],

    once: jest.fn(<T>(type: string, handler: (event: T) => void): EventSubscription => {
      const wrappedHandler = (payload: unknown) => {
        listeners.get(type)?.delete(wrappedHandler);
        (handler as (payload: unknown) => void)(payload);
      };
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(wrappedHandler);
      return createSubscription(type, wrappedHandler);
    }) as IEventBus['once'],

    off: jest.fn((type: string): void => {
      listeners.delete(type);
    }),

    waitFor: jest.fn(<T>(type: string): Promise<T> => {
      return new Promise((resolve) => {
        const handler = (event: unknown) => {
          listeners.get(type)?.delete(handler as (payload: unknown) => void);
          resolve(event as T);
        };
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)!.add(handler as (payload: unknown) => void);
      });
    }) as IEventBus['waitFor'],
  };
}

/**
 * Create a mock FileSystem
 */
export function createMockFileSystem(): IFileSystem & { files: Map<string, string> } {
  const files = new Map<string, string>();
  const now = new Date();

  return {
    files,
    exists: jest.fn(async (path: FilePath) => files.has(path as string)),
    readFile: jest.fn(async (path: FilePath) => {
      const pathStr = path as string;
      if (!files.has(pathStr)) {
        throw new Error(`File not found: ${pathStr}`);
      }
      return files.get(pathStr)!;
    }),
    writeFile: jest.fn(async (path: FilePath, content: string) => {
      files.set(path as string, content);
    }),
    deleteFile: jest.fn(async (path: FilePath) => {
      files.delete(path as string);
    }),
    mkdir: jest.fn(async () => {}),
    rmdir: jest.fn(async () => {}),
    readdir: jest.fn(async () => []),
    stat: jest.fn(async () => ({
      isFile: true,
      isDirectory: false,
      size: 0,
      modifiedAt: now,
      createdAt: now,
      accessedAt: now,
    })),
    dirname: jest.fn((path: FilePath): FilePath => {
      const pathStr = path as string;
      const parts = pathStr.replace(/\\/g, '/').split('/');
      parts.pop();
      return (parts.join('/') || '/') as FilePath;
    }),
    basename: jest.fn((path: FilePath): string => {
      const pathStr = path as string;
      const parts = pathStr.replace(/\\/g, '/').split('/');
      return parts.pop() || '';
    }),
    join: jest.fn((...paths: string[]): FilePath => paths.join('/') as FilePath),
    relative: jest.fn((from: FilePath, to: FilePath): RelativePath => (to as string) as RelativePath),
    resolve: jest.fn((...paths: string[]): FilePath => paths.join('/') as FilePath),
    glob: jest.fn(async () => []),
    readFileBuffer: jest.fn(async () => Buffer.from('')),
    copyFile: jest.fn(async () => {}),
    moveFile: jest.fn(async () => {}),
    extname: jest.fn((path: FilePath): string => {
      const pathStr = path as string;
      const lastDot = pathStr.lastIndexOf('.');
      return lastDot >= 0 ? pathStr.slice(lastDot) : '';
    }),
    watch: jest.fn(() => ({
      dispose: () => {},
    })),
  };
}

// Branded type helpers
export const createFilePath = (path: string): FilePath => path as FilePath;
export const createBranchId = (id: string): VirtualBranchId => id as VirtualBranchId;
export const createAgentId = (id: string): AgentId => id as AgentId;
export const createTaskId = (id: string): TaskId => id as TaskId;
export const createMissionId = (id: string): MissionId => id as MissionId;
export const createLineNumber = (n: number): LineNumber => n as LineNumber;
