import { FriendlyError } from '../content/language'

export interface BrowserStore {
  database: string
  collection: string
  keyPath: string
}

function openStore({ database, collection, keyPath }: BrowserStore): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(collection, { keyPath })
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new FriendlyError('Browser storage is busy. Close other DocuFlow tabs and try again.'))
    }
  })
}

export async function runBrowserTransaction<T>(
  config: BrowserStore,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
  const database = await openStore(config)
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(config.collection, mode)
      let result: T
      const fail = (error: unknown) => { reject(error); tx.abort() }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('Browser storage transaction aborted.'))
      try {
        operation(tx.objectStore(config.collection), (value) => { result = value }, fail)
      } catch (error) {
        fail(error)
      }
    })
  } finally {
    database.close()
  }
}

export function browserRequest<T>(config: BrowserStore, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return runBrowserTransaction(config, mode, (store, setResult) => {
    const request = operation(store)
    request.onsuccess = () => setResult(request.result)
  })
}
