const DB_NAME = 'archive'
export const ARCHIVE_DB_VERSION = 3
export const ARCHIVE_STORE_DEFINITIONS = {
  settings: { keyPath: 'key' },
  imports: { keyPath: 'id' },
  metadata: { keyPath: 'conversationId' },
  archiveIndex: { keyPath: 'conversationId' },
  searchDocuments: { keyPath: 'conversationId' },
  searchMeta: { keyPath: 'key' },
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

export async function openCompatibleDatabase(name, targetVersion, indexedDbFactory, onUpgrade) {
  const open = version => {
    const request = version === undefined
      ? indexedDbFactory.open(name)
      : indexedDbFactory.open(name, version)

    if (version !== undefined && onUpgrade) {
      request.onupgradeneeded = () => onUpgrade(request.result)
    }
    return requestAsPromise(request)
  }

  try {
    return await open(targetVersion)
  } catch (error) {
    if (error?.name !== 'VersionError') throw error
    return open(undefined)
  }
}

export async function openArchiveDb(name = DB_NAME, indexedDbFactory = globalThis.indexedDB) {
  if (!indexedDbFactory) throw new Error('IndexedDB is not available in this browser')

  const database = await openCompatibleDatabase(
    name,
    ARCHIVE_DB_VERSION,
    indexedDbFactory,
    db => {
      for (const [storeName, definition] of Object.entries(ARCHIVE_STORE_DEFINITIONS)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, definition)
        }
      }
    },
  )

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
