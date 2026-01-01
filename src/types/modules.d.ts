/**
 * Module declarations for packages without type definitions
 */

declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: (string | number | null | Uint8Array)[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface Statement {
    bind(params?: (string | number | null | Uint8Array)[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(): Promise<SqlJsStatic>;
}

declare module 'glob' {
  export function sync(pattern: string, options?: object): string[];
  export function glob(pattern: string, options?: object): Promise<string[]>;
}

declare module 'uuid' {
  export function v4(): string;
}
