import { invokeOrBridge } from '../lab/invoke-or-bridge'

const STORE_URI = 'desktop://document/async-storage.json'

type Store = Record<string, string>

async function readStore(): Promise<Store> {
  try {
    const raw = await invokeOrBridge<string>('lab_fs_read_text', 'fs_read_text', { uri: STORE_URI })
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Store : {}
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  await invokeOrBridge('lab_fs_write_text', 'fs_write_text', {
    uri: STORE_URI,
    contents: JSON.stringify(store),
  })
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    const store = await readStore()
    return store[key] ?? null
  },
  async setItem(key: string, value: string): Promise<void> {
    const store = await readStore()
    store[key] = value
    await writeStore(store)
  },
  async removeItem(key: string): Promise<void> {
    const store = await readStore()
    delete store[key]
    await writeStore(store)
  },
  async clear(): Promise<void> {
    await writeStore({})
  },
  async getAllKeys(): Promise<string[]> {
    return Object.keys(await readStore())
  },
  async multiGet(keys: string[]): Promise<Array<[string, string | null]>> {
    const store = await readStore()
    return keys.map((key) => [key, store[key] ?? null])
  },
  async multiSet(entries: Array<[string, string]>): Promise<void> {
    const store = await readStore()
    for (const [key, value] of entries) store[key] = value
    await writeStore(store)
  },
  async multiRemove(keys: string[]): Promise<void> {
    const store = await readStore()
    for (const key of keys) delete store[key]
    await writeStore(store)
  },
}

export default AsyncStorage
