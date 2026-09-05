const DB_NAME = 'archive'
export const ARCHIVE_DB_VERSION = 2
export const ARCHIVE_STORE_DEFINITIONS = {
  settings: { keyPath: 'key' },
  imports: { keyPath: 'id' },
  metadata: { keyPath: 'conversationId' },
  archiveIndex: { keyPath: 'conversationId' },
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function openArchiveDb(name = DB_NAME, indexedDbFactory = globalThis.indexedDB) {
  if (!indexedDbFactory) throw new Error('IndexedDB is not available in this browser')

  const request = indexedDbFactory.open(name, ARCHIVE_DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    for (const [storeName, definition] of Object.entries(ARCHIVE_STORE_DEFINITIONS)) {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, definition)
      }
    }
  }

  const database = await requestAsPromise(request)

  return {
    async get(storeName, key) {
      const tx = database.transaction(storeName, 'readonly')
      const value = await requestAsPromise(tx.objectStore(storeName).get(key))
      await transactionDone(tx)
      return value ?? null
    },

    async getAll(storeName) {
      const tx = database.transaction(storeName, 'readonly')
      const value = await requestAsPromise(tx.objectStore(storeName).getAll())
      await transactionDone(tx)
      return value
    },

    async put(storeName, value) {
      const tx = database.transaction(storeName, 'readwrite')
      await requestAsPromise(tx.objectStore(storeName).put(value))
      await transactionDone(tx)
    },

    async delete(storeName, key) {
      const tx = database.transaction(storeName, 'readwrite')
      await requestAsPromise(tx.objectStore(storeName).delete(key))
      await transactionDone(tx)
    },

    async clear(storeName) {
      const tx = database.transaction(storeName, 'readwrite')
      await requestAsPromise(tx.objectStore(storeName).clear())
      await transactionDone(tx)
    },

    async clearAll() {
      const storeNames = Object.keys(ARCHIVE_STORE_DEFINITIONS)
      const tx = database.transaction(storeNames, 'readwrite')
      for (const storeName of storeNames) tx.objectStore(storeName).clear()
      await transactionDone(tx)
    },

    close() {
      database.close()
    },
  }
}
