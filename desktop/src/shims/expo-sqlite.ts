export type SQLiteDatabase = {
  execAsync: (sql: string) => Promise<void>
  execSync: (sql: string) => void
  getAllAsync: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T[]>
  getAllSync: <T = unknown>(sql: string, ...params: unknown[]) => T[]
  getFirstAsync: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T | null>
  getFirstSync: <T = unknown>(sql: string, ...params: unknown[]) => T | null
  runAsync: (sql: string, ...params: unknown[]) => Promise<{ changes: number; lastInsertRowId: number }>
  runSync: (sql: string, ...params: unknown[]) => { changes: number; lastInsertRowId: number }
  withExclusiveTransactionAsync: (fn: (txn: SQLiteDatabase) => Promise<void>) => Promise<void>
  withTransactionSync: (fn: () => void) => void
}

function unsupported(): never {
  throw new Error('expo-sqlite is not used by the desktop web lab shell')
}

export function openDatabaseSync(_name?: string): SQLiteDatabase {
  return {
    execAsync: async () => unsupported(),
    execSync: unsupported,
    getAllAsync: async () => unsupported(),
    getAllSync: unsupported,
    getFirstAsync: async () => unsupported(),
    getFirstSync: unsupported,
    runAsync: async () => unsupported(),
    runSync: unsupported,
    withExclusiveTransactionAsync: async (fn) => fn(openDatabaseSync()),
    withTransactionSync: (fn) => fn(),
  }
}

export async function openDatabaseAsync(_name?: string): Promise<SQLiteDatabase> {
  return openDatabaseSync()
}
