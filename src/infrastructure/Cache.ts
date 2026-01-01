/**
 * Cache Implementation
 *
 * In-memory cache with TTL support, tagging, and namespacing.
 * Optionally persists to disk using LevelDB for durability.
 */

import { ICache, CacheOptions, CacheStats, CacheConfig, ILogger, FilePath } from '../types';

/** Cache entry with metadata */
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  tags: Set<string>;
  createdAt: number;
  accessedAt: number;
  size: number;
}

/**
 * In-memory cache implementation with TTL and tagging
 */
export class MemoryCache implements ICache {
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly tagIndex: Map<string, Set<string>> = new Map();
  private readonly config: CacheConfig;
  private readonly logger?: ILogger;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    keys: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig, logger?: ILogger) {
    this.config = config;
    this.logger = logger?.child('Cache');

    // Start cleanup interval for expired entries
    this.startCleanupInterval();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats = { ...this.stats, misses: this.stats.misses + 1 };
      return null;
    }

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      await this.delete(key);
      this.stats = { ...this.stats, misses: this.stats.misses + 1 };
      return null;
    }

    // Update access time
    entry.accessedAt = Date.now();
    this.stats = { ...this.stats, hits: this.stats.hits + 1 };

    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const existingEntry = this.cache.get(key);
    const size = this.estimateSize(value);

    // Check if we need to evict entries
    if (existingEntry) {
      this.stats = { ...this.stats, size: this.stats.size - existingEntry.size };
      this.removeFromTagIndex(key, existingEntry.tags);
    }

    // Evict if necessary
    while (this.stats.size + size > this.config.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    const expiresAt =
      options?.ttl !== undefined
        ? Date.now() + options.ttl
        : this.config.defaultTtl
          ? Date.now() + this.config.defaultTtl
          : null;

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      tags: new Set(options?.tags ?? []),
      createdAt: Date.now(),
      accessedAt: Date.now(),
      size,
    };

    this.cache.set(key, entry);
    this.addToTagIndex(key, entry.tags);

    this.stats = {
      ...this.stats,
      size: this.stats.size + size,
      keys: this.cache.size,
    };

    this.logger?.debug('Cache set', { key, size, ttl: options?.ttl });
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.removeFromTagIndex(key, entry.tags);
    this.cache.delete(key);

    this.stats = {
      ...this.stats,
      size: this.stats.size - entry.size,
      keys: this.cache.size,
    };

    return true;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      keys: 0,
    };
    this.logger?.info('Cache cleared');
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) {
        result.set(key, value);
      }
    }

    return result;
  }

  async setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, options);
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  async deleteByTag(tag: string): Promise<number> {
    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) {
      return 0;
    }

    const keyArray = Array.from(keys);
    return this.deleteMany(keyArray);
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  namespace(prefix: string): ICache {
    return new NamespacedCache(this, prefix);
  }

  /**
   * Stop the cleanup interval
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);

    // Don't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      this.deleteMany(keysToDelete);
      this.logger?.debug('Cleaned up expired entries', { count: keysToDelete.length });
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.logger?.debug('Evicted LRU entry', { key: oldestKey });
    }
  }

  private addToTagIndex(key: string, tags: Set<string>): void {
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagIndex.set(tag, keys);
      }
      keys.add(key);
    }
  }

  private removeFromTagIndex(key: string, tags: Set<string>): void {
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) {
      return 8;
    }

    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }

    if (value instanceof Buffer) {
      return value.length;
    }

    // For objects, stringify to estimate size
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default estimate for non-serializable objects
    }
  }
}

/**
 * Namespaced cache wrapper
 */
class NamespacedCache implements ICache {
  private readonly parent: ICache;
  private readonly prefix: string;

  constructor(parent: ICache, prefix: string) {
    this.parent = parent;
    this.prefix = prefix + ':';
  }

  private prefixKey(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.parent.get<T>(this.prefixKey(key));
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const prefixedTags = options?.tags?.map((t) => this.prefix + t);
    return this.parent.set(key, value, {
      ...options,
      tags: prefixedTags,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.parent.delete(this.prefixKey(key));
  }

  async has(key: string): Promise<boolean> {
    return this.parent.has(this.prefixKey(key));
  }

  async clear(): Promise<void> {
    // Can't clear just the namespace, would need to iterate all keys
    // This is a limitation of the namespaced cache
    throw new Error('Cannot clear namespaced cache');
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    const result = await this.parent.getMany<T>(prefixedKeys);

    // Remove prefix from result keys
    const unprefixed = new Map<string, T>();
    for (const [key, value] of result) {
      unprefixed.set(key.substring(this.prefix.length), value);
    }
    return unprefixed;
  }

  async setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void> {
    const prefixed = new Map<string, T>();
    for (const [key, value] of entries) {
      prefixed.set(this.prefixKey(key), value);
    }
    return this.parent.setMany(prefixed, options);
  }

  async deleteMany(keys: string[]): Promise<number> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    return this.parent.deleteMany(prefixedKeys);
  }

  async deleteByTag(tag: string): Promise<number> {
    return this.parent.deleteByTag(this.prefix + tag);
  }

  getStats(): CacheStats {
    return this.parent.getStats();
  }

  namespace(prefix: string): ICache {
    return new NamespacedCache(this.parent, this.prefix + prefix);
  }
}

/**
 * Create a memory cache
 */
export function createCache(config: CacheConfig, logger?: ILogger): ICache {
  return new MemoryCache(config, logger);
}

/**
 * Create a default cache with sensible defaults
 */
export function createDefaultCache(logger?: ILogger): ICache {
  return new MemoryCache(
    {
      path: '' as FilePath,
      maxSize: 50 * 1024 * 1024, // 50MB
      defaultTtl: 30 * 60 * 1000, // 30 minutes
    },
    logger
  );
}
