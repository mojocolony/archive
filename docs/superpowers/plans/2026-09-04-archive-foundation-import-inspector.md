# Archive Foundation & Import Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently testable slice of Archive: the PWA shell, local data model, Dropbox PKCE connection, Dropbox app-folder repository, and a streaming ChatGPT-export inspector that reports the exact export schema without persisting transcript content.

**Architecture:** A React/TypeScript PWA runs entirely in the browser. Dexie wraps IndexedDB for local derived state; the official Dropbox JavaScript SDK handles OAuth PKCE and app-folder file operations; `fflate` streams ZIP entries so multi-gigabyte ChatGPT exports are never decompressed wholesale into memory. This first slice deliberately stops before normalizing ChatGPT conversations: the Import Inspector records filenames, sizes, and structural JSON keys from the user's real export so the parser in the next plan is based on evidence rather than guessed schema.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, Dexie 4, official `dropbox` JavaScript SDK, `fflate`, Web Crypto, IndexedDB, Service Worker/PWA manifest.

**Spec:** `docs/superpowers/specs/2026-09-04-archive-v1-design.md`

## Global Constraints

- Dropbox is the only cloud service in v1.
- No transcript text may be sent to analytics, external search, AI classification, error reporting, or hosted databases.
- Original ChatGPT exports are read-only source material.
- Local IndexedDB data is derived/rebuildable unless explicitly categorized as pending unsynced metadata.
- The 4 GB-class source ZIP must be processed by streaming; never use `File.arrayBuffer()` on the entire ZIP.
- Dropbox browser authentication uses OAuth authorization-code flow with PKCE; no app secret may be embedded in browser source.
- Prefer Dropbox App Folder permission for the production app.
- Import inspection must not persist message bodies or transcript text.
- No parser assumptions about ChatGPT's export schema are permitted until a real export inspection report is available.
- All user-facing destructive operations remain out of this slice.

---

## File Structure

```text
archive/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── App.test.tsx
│   ├── domain/
│   │   ├── models.ts
│   │   └── models.test.ts
│   ├── local/
│   │   ├── db.ts
│   │   ├── settingsRepository.ts
│   │   └── db.test.ts
│   ├── dropbox/
│   │   ├── auth.ts
│   │   ├── auth.test.ts
│   │   ├── client.ts
│   │   ├── archiveRepository.ts
│   │   └── archiveRepository.test.ts
│   ├── import/
│   │   ├── types.ts
│   │   ├── zipStream.ts
│   │   ├── zipStream.test.ts
│   │   ├── jsonShape.ts
│   │   ├── jsonShape.test.ts
│   │   ├── inspector.ts
│   │   └── inspector.test.ts
│   ├── features/
│   │   ├── home/HomePage.tsx
│   │   ├── settings/DropboxConnection.tsx
│   │   └── import/ImportInspectorPage.tsx
│   └── test/
│       ├── setup.ts
│       └── fixtures/
│           └── inspector-fixture.zip
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-09-04-archive-v1-design.md
        └── plans/
            └── 2026-09-04-archive-foundation-import-inspector.md
```

### Boundary rules

- `domain/` contains plain TypeScript types only; no React, Dropbox, or IndexedDB imports.
- `local/` owns IndexedDB persistence.
- `dropbox/` owns OAuth and Dropbox API calls.
- `import/` owns ZIP/schema inspection and has no UI imports.
- `features/` owns React presentation and calls the above modules through exported interfaces.
- No feature component calls the Dropbox SDK or Dexie directly.

---

### Task 1: Scaffold the PWA and test harness

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/test/setup.ts`
- Create: `public/manifest.webmanifest`

**Interfaces:**
- Produces: React app root and Vitest test environment used by all later tasks.
- Consumes: none.

- [ ] **Step 1: Create the Vite React/TypeScript project and install dependencies**

Run:

```bash
npm create vite@latest archive -- --template react-ts
cd archive
npm install
npm install dexie dropbox fflate
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```

- [ ] **Step 2: Configure Vitest**

Add to `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: Write the failing app-shell test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders Archive and the import entry point', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import ChatGPT Export' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the test and confirm failure**

Run:

```bash
npm test -- --run src/app/App.test.tsx
```

Expected: FAIL because `App` does not yet export the required shell.

- [ ] **Step 5: Implement the minimal shell**

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Archive</h1>
      <a href="#/import">Import ChatGPT Export</a>
    </main>
  )
}
```

Update `src/main.tsx` to render `<App />`.

- [ ] **Step 6: Add the PWA manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Archive",
  "short_name": "Archive",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": []
}
```

Do not add final icons in this slice.

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests PASS and Vite production build succeeds.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: scaffold Archive PWA"
```

---

### Task 2: Define domain models and ownership boundaries

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/domain/models.test.ts`

**Interfaces:**
- Produces:
  - `ConversationSourceRef`
  - `ArchiveMetadata`
  - `ImportRecord`
  - `DropboxConnectionState`
  - `InspectionReport`
- Consumes: none.

- [ ] **Step 1: Write the failing type-behaviour test**

Create `src/domain/models.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeEmptyArchiveMetadata } from './models'

describe('makeEmptyArchiveMetadata', () => {
  it('creates independent Archive-owned metadata', () => {
    expect(makeEmptyArchiveMetadata('conv-123')).toEqual({
      conversationId: 'conv-123',
      customTitle: null,
      folderId: null,
      tags: [],
      starred: false,
      note: '',
      reviewed: false,
      trashedAt: null,
      updatedAt: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/domain/models.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the domain types**

Create `src/domain/models.ts`:

```ts
export interface ConversationSourceRef {
  conversationId: string
  originalTitle: string | null
  projectId: string | null
  projectTitle: string | null
  createdAt: string | null
  updatedAt: string | null
  sourceStatus: 'live' | 'archive-only' | 'unverified'
  chatGptUrl: string | null
}

export interface ArchiveMetadata {
  conversationId: string
  customTitle: string | null
  folderId: string | null
  tags: string[]
  starred: boolean
  note: string
  reviewed: boolean
  trashedAt: string | null
  updatedAt: string | null
}

export interface ImportRecord {
  id: string
  sourceFileName: string
  sourceFileSize: number
  inspectedAt: string
  status: 'inspected' | 'imported' | 'failed'
  reportPath: string | null
}

export interface DropboxConnectionState {
  connected: boolean
  accountId: string | null
  displayName: string | null
}

export interface JsonShapeSummary {
  topLevelType: 'object' | 'array' | 'primitive' | 'invalid-json'
  topLevelKeys: string[]
  firstArrayItemKeys: string[]
}

export interface InspectionEntry {
  path: string
  compressedSize: number | null
  originalSize: number | null
  category: 'json' | 'html' | 'media' | 'other'
  jsonShape: JsonShapeSummary | null
}

export interface InspectionReport {
  sourceFileName: string
  sourceFileSize: number
  inspectedAt: string
  entries: InspectionEntry[]
}

export function makeEmptyArchiveMetadata(conversationId: string): ArchiveMetadata {
  return {
    conversationId,
    customTitle: null,
    folderId: null,
    tags: [],
    starred: false,
    note: '',
    reviewed: false,
    trashedAt: null,
    updatedAt: null,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/domain/models.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: define Archive domain models"
```

---

### Task 3: Create the local Dexie database

**Files:**
- Create: `src/local/db.ts`
- Create: `src/local/db.test.ts`
- Create: `src/local/settingsRepository.ts`

**Interfaces:**
- Consumes: `ArchiveMetadata`, `ImportRecord`
- Produces:
  - `ArchiveDb`
  - `createArchiveDb(name?: string): ArchiveDb`
  - `SettingsRepository`

- [ ] **Step 1: Write failing database tests**

Create `src/local/db.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { createArchiveDb } from './db'

describe('ArchiveDb', () => {
  const dbs: ReturnType<typeof createArchiveDb>[] = []

  afterEach(async () => {
    await Promise.all(dbs.map(db => db.delete()))
  })

  it('stores Archive metadata independently by conversation ID', async () => {
    const db = createArchiveDb(`archive-test-${crypto.randomUUID()}`)
    dbs.push(db)

    await db.metadata.put({
      conversationId: 'conv-1',
      customTitle: 'Useful title',
      folderId: null,
      tags: ['rush'],
      starred: true,
      note: '',
      reviewed: true,
      trashedAt: null,
      updatedAt: '2026-09-04T12:00:00Z',
    })

    expect((await db.metadata.get('conv-1'))?.customTitle).toBe('Useful title')
  })

  it('stores import inspection records without transcript bodies', async () => {
    const db = createArchiveDb(`archive-test-${crypto.randomUUID()}`)
    dbs.push(db)

    await db.imports.add({
      id: 'import-1',
      sourceFileName: 'export.zip',
      sourceFileSize: 4000000000,
      inspectedAt: '2026-09-04T12:00:00Z',
      status: 'inspected',
      reportPath: '/System/inspection/import-1.json',
    })

    const row = await db.imports.get('import-1')
    expect(row?.status).toBe('inspected')
    expect(Object.keys(row ?? {})).not.toContain('messages')
  })
})
```

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- --run src/local/db.test.ts
```

Expected: FAIL because `db.ts` does not exist.

- [ ] **Step 3: Implement Dexie schema**

Create `src/local/db.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { ArchiveMetadata, ImportRecord } from '../domain/models'

export interface LocalSetting {
  key: string
  value: string
}

export class ArchiveDb extends Dexie {
  metadata!: EntityTable<ArchiveMetadata, 'conversationId'>
  imports!: EntityTable<ImportRecord, 'id'>
  settings!: EntityTable<LocalSetting, 'key'>

  constructor(name = 'archive') {
    super(name)
    this.version(1).stores({
      metadata: 'conversationId, folderId, starred, reviewed, updatedAt, *tags',
      imports: 'id, inspectedAt, status',
      settings: 'key',
    })
  }
}

export function createArchiveDb(name?: string) {
  return new ArchiveDb(name)
}
```

- [ ] **Step 4: Implement a settings repository**

Create `src/local/settingsRepository.ts`:

```ts
import type { ArchiveDb } from './db'

export class SettingsRepository {
  constructor(private readonly db: ArchiveDb) {}

  async get(key: string): Promise<string | null> {
    return (await this.db.settings.get(key))?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.settings.put({ key, value })
  }

  async remove(key: string): Promise<void> {
    await this.db.settings.delete(key)
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run src/local/db.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/local
git commit -m "feat: add local IndexedDB store"
```

---

### Task 4: Implement Dropbox OAuth PKCE without an app secret

**Files:**
- Create: `src/dropbox/auth.ts`
- Create: `src/dropbox/auth.test.ts`
- Create: `src/dropbox/client.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes: `SettingsRepository`
- Produces:
  - `DropboxAuthService`
  - `createDropboxClient(accessToken: string)`
- Required environment variable: `VITE_DROPBOX_APP_KEY`

- [ ] **Step 1: Add the public configuration template**

Create `.env.example`:

```text
VITE_DROPBOX_APP_KEY=
```

The production Dropbox app key is public OAuth client configuration. No app secret is used or stored.

- [ ] **Step 2: Write a failing PKCE state test**

Create `src/dropbox/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateOAuthState } from './auth'

describe('validateOAuthState', () => {
  it('accepts an exact state match', () => {
    expect(validateOAuthState('abc', 'abc')).toBe(true)
  })

  it('rejects missing or mismatched state', () => {
    expect(validateOAuthState(null, 'abc')).toBe(false)
    expect(validateOAuthState('def', 'abc')).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify failure**

```bash
npm test -- --run src/dropbox/auth.test.ts
```

Expected: FAIL because `auth.ts` does not exist.

- [ ] **Step 4: Implement OAuth helpers and PKCE service**

Create `src/dropbox/auth.ts`:

```ts
import { DropboxAuth } from 'dropbox'
import type { SettingsRepository } from '../local/settingsRepository'

const VERIFIER_KEY = 'dropbox.pkce.verifier'
const STATE_KEY = 'dropbox.oauth.state'
const TOKEN_KEY = 'dropbox.accessToken'
const REFRESH_KEY = 'dropbox.refreshToken'
const EXPIRES_KEY = 'dropbox.expiresAt'

export function validateOAuthState(returned: string | null, expected: string | null) {
  return Boolean(returned && expected && returned === expected)
}

function randomState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export class DropboxAuthService {
  constructor(
    private readonly appKey: string,
    private readonly settings: SettingsRepository,
  ) {}

  async begin(redirectUri: string): Promise<string> {
    const auth = new DropboxAuth({ clientId: this.appKey })
    const state = randomState()

    const url = await auth.getAuthenticationUrl(
      redirectUri,
      state,
      'code',
      'offline',
      undefined,
      undefined,
      true,
    )

    const verifier = auth.getCodeVerifier()
    if (!verifier) throw new Error('Dropbox PKCE verifier was not created')

    await this.settings.set(VERIFIER_KEY, verifier)
    await this.settings.set(STATE_KEY, state)
    return String(url)
  }

  async finish(callbackUrl: string, redirectUri: string): Promise<string> {
    const url = new URL(callbackUrl)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const expectedState = await this.settings.get(STATE_KEY)
    const verifier = await this.settings.get(VERIFIER_KEY)

    if (!code) throw new Error('Dropbox callback is missing authorization code')
    if (!validateOAuthState(returnedState, expectedState)) {
      throw new Error('Dropbox OAuth state mismatch')
    }
    if (!verifier) throw new Error('Dropbox PKCE verifier is missing')

    const auth = new DropboxAuth({ clientId: this.appKey })
    auth.setCodeVerifier(verifier)
    const response = await auth.getAccessTokenFromCode(redirectUri, code)
    const token = response.result.access_token
    if (!token) throw new Error('Dropbox did not return an access token')

    await this.settings.set(TOKEN_KEY, token)
    if (response.result.refresh_token) {
      await this.settings.set(REFRESH_KEY, response.result.refresh_token)
    }
    if (response.result.expires_in) {
      await this.settings.set(
        EXPIRES_KEY,
        String(Date.now() + response.result.expires_in * 1000),
      )
    }

    await this.settings.remove(VERIFIER_KEY)
    await this.settings.remove(STATE_KEY)
    return token
  }
}
```

If the installed Dropbox SDK's exact TypeScript signature differs, adapt only the SDK call site while preserving this service interface and security behaviour.

- [ ] **Step 5: Implement Dropbox client creation**

Create `src/dropbox/client.ts`:

```ts
import { Dropbox } from 'dropbox'

export function createDropboxClient(accessToken: string) {
  return new Dropbox({ accessToken })
}
```

- [ ] **Step 6: Run unit tests**

```bash
npm test -- --run src/dropbox/auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Manual OAuth smoke test**

Configure a Dropbox development app with:
- scoped access
- App Folder access
- redirect URI equal to the local Vite callback URL

Set `VITE_DROPBOX_APP_KEY` locally, start the app, complete authorization, and confirm:
- browser source contains no app secret
- returned state is validated
- access token is stored only in local IndexedDB
- Dropbox grants only the configured app-folder scope

- [ ] **Step 8: Commit**

```bash
git add src/dropbox .env.example
git commit -m "feat: add Dropbox PKCE authentication"
```

---

### Task 5: Implement the Dropbox archive repository

**Files:**
- Create: `src/dropbox/archiveRepository.ts`
- Create: `src/dropbox/archiveRepository.test.ts`

**Interfaces:**
- Consumes: a Dropbox-compatible client implementing upload/download/list methods.
- Produces:
  - `ArchiveRepository.ensureStructure()`
  - `ArchiveRepository.writeJson(path, value)`
  - `ArchiveRepository.readJson<T>(path)`
  - `ArchiveRepository.writeInspectionReport(importId, report)`

- [ ] **Step 1: Write a failing repository-path test**

Create `src/dropbox/archiveRepository.test.ts` using a fake client:

```ts
import { describe, expect, it } from 'vitest'
import { ArchiveRepository } from './archiveRepository'

describe('ArchiveRepository', () => {
  it('writes inspection reports under System/inspection', async () => {
    const calls: unknown[] = []
    const fake = {
      filesUpload: async (arg: unknown) => {
        calls.push(arg)
        return { result: {} }
      },
    }

    const repo = new ArchiveRepository(fake as never)
    await repo.writeInspectionReport('import-1', {
      sourceFileName: 'export.zip',
      sourceFileSize: 1,
      inspectedAt: '2026-09-04T12:00:00Z',
      entries: [],
    })

    expect(calls[0]).toMatchObject({
      path: '/System/inspection/import-1.json',
      mode: { '.tag': 'overwrite' },
    })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --run src/dropbox/archiveRepository.test.ts
```

Expected: FAIL because repository is absent.

- [ ] **Step 3: Implement repository**

Create `src/dropbox/archiveRepository.ts`:

```ts
import type { InspectionReport } from '../domain/models'

interface UploadClient {
  filesUpload(arg: {
    path: string
    contents: string
    mode: { '.tag': 'overwrite' }
    mute: boolean
  }): Promise<unknown>
}

export class ArchiveRepository {
  constructor(private readonly client: UploadClient) {}

  async writeJson(path: string, value: unknown): Promise<void> {
    await this.client.filesUpload({
      path,
      contents: JSON.stringify(value, null, 2),
      mode: { '.tag': 'overwrite' },
      mute: true,
    })
  }

  async writeInspectionReport(importId: string, report: InspectionReport) {
    await this.writeJson(`/System/inspection/${importId}.json`, report)
  }
}
```

Do not implement transcript or attachment upload yet.

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/dropbox/archiveRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dropbox/archiveRepository*
git commit -m "feat: add Dropbox archive repository"
```

---

### Task 6: Build streaming ZIP-entry discovery

**Files:**
- Create: `src/import/types.ts`
- Create: `src/import/zipStream.ts`
- Create: `src/import/zipStream.test.ts`
- Create: `src/test/fixtures/inspector-fixture.zip`

**Interfaces:**
- Produces:
  - `ZipEntryDescriptor`
  - `inspectZipEntries(file: File, onEntry: (entry) => Promise<void> | void): Promise<void>`
- Consumes: browser `File`, `fflate.Unzip`

- [ ] **Step 1: Define ZIP entry type**

Create `src/import/types.ts`:

```ts
export interface ZipEntryDescriptor {
  path: string
  compressedSize: number | null
  originalSize: number | null
  streamText(maxBytes: number): Promise<string>
}
```

- [ ] **Step 2: Create a deterministic tiny ZIP fixture**

Create a fixture ZIP containing:
- `conversations.json` with `[{"id":"conv-1","title":"Example","mapping":{}}]`
- `chat.html` with `<html><body>Example</body></html>`
- `image.png` containing a few bytes

Generate the fixture in a one-off test utility or checked-in binary; do not base it on user data.

- [ ] **Step 3: Write failing streaming test**

Create `src/import/zipStream.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { inspectZipEntries } from './zipStream'

describe('inspectZipEntries', () => {
  it('discovers entries without requesting the whole File as an ArrayBuffer', async () => {
    const bytes = await readFile('src/test/fixtures/inspector-fixture.zip')
    const file = new File([bytes], 'export.zip')
    const names: string[] = []

    await inspectZipEntries(file, entry => {
      names.push(entry.path)
    })

    expect(names).toContain('conversations.json')
    expect(names).toContain('chat.html')
    expect(names).toContain('image.png')
  })
})
```

- [ ] **Step 4: Run and confirm failure**

```bash
npm test -- --run src/import/zipStream.test.ts
```

Expected: FAIL because `zipStream.ts` does not exist.

- [ ] **Step 5: Implement chunked ZIP streaming**

Create `src/import/zipStream.ts`.

Implementation rules:
- Use `File.stream().getReader()`.
- Push each `Uint8Array` chunk into `fflate.Unzip`.
- Register `UnzipInflate`.
- Do not call `file.arrayBuffer()` on the source ZIP.
- For each entry, expose only a bounded `streamText(maxBytes)` reader.
- `streamText` must stop after `maxBytes`, terminate the entry, and reject binary decoding failures.
- The main inspection loop starts only entries requested by `streamText`.

Core shape:

```ts
import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import type { ZipEntryDescriptor } from './types'

export async function inspectZipEntries(
  file: File,
  onEntry: (entry: ZipEntryDescriptor) => Promise<void> | void,
): Promise<void> {
  const unzip = new Unzip()
  unzip.register(UnzipInflate)

  const pending: Promise<void>[] = []

  unzip.onfile = zipFile => {
    let started = false

    const descriptor: ZipEntryDescriptor = {
      path: zipFile.name,
      compressedSize: zipFile.size ?? null,
      originalSize: zipFile.originalSize ?? null,
      streamText(maxBytes: number) {
        if (started) throw new Error(`Entry already consumed: ${zipFile.name}`)
        started = true

        return new Promise<string>((resolve, reject) => {
          const chunks: Uint8Array[] = []
          let total = 0

          zipFile.ondata = (err, chunk, final) => {
            if (err) {
              reject(err)
              return
            }

            const remaining = Math.max(0, maxBytes - total)
            if (remaining > 0) {
              chunks.push(chunk.subarray(0, remaining))
              total += Math.min(chunk.length, remaining)
            }

            if (total >= maxBytes && !final) {
              zipFile.terminate()
              resolve(strFromU8(concat(chunks)))
              return
            }

            if (final) resolve(strFromU8(concat(chunks)))
          }

          zipFile.start()
        })
      },
    }

    pending.push(Promise.resolve(onEntry(descriptor)))
  }

  const reader = file.stream().getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    unzip.push(value, false)
  }
  unzip.push(new Uint8Array(), true)
  await Promise.all(pending)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((n, chunk) => n + chunk.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}
```

During implementation, verify `fflate` entry scheduling behaviour with the fixture. If `onEntry` must call `streamText` synchronously before subsequent chunks are pushed, adjust the loop so the contract above remains stable and bounded.

- [ ] **Step 6: Add a guard test against whole-file reads**

Instrument a custom `File` subclass or spy so that calling `.arrayBuffer()` throws. Assert the inspection still succeeds.

- [ ] **Step 7: Run tests**

```bash
npm test -- --run src/import/zipStream.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/import src/test/fixtures
git commit -m "feat: stream ZIP entries for large exports"
```

---

### Task 7: Summarize JSON structure without storing transcript text

**Files:**
- Create: `src/import/jsonShape.ts`
- Create: `src/import/jsonShape.test.ts`

**Interfaces:**
- Produces: `summarizeJsonShape(text: string): JsonShapeSummary`
- Consumes: `JsonShapeSummary`

- [ ] **Step 1: Write failing tests**

Create `src/import/jsonShape.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summarizeJsonShape } from './jsonShape'

describe('summarizeJsonShape', () => {
  it('summarizes an array without returning values', () => {
    expect(
      summarizeJsonShape('[{"id":"secret-id","title":"private title","mapping":{}}]')
    ).toEqual({
      topLevelType: 'array',
      topLevelKeys: [],
      firstArrayItemKeys: ['id', 'mapping', 'title'],
    })
  })

  it('summarizes an object', () => {
    expect(summarizeJsonShape('{"conversations":[],"user":{"name":"private"}}')).toEqual({
      topLevelType: 'object',
      topLevelKeys: ['conversations', 'user'],
      firstArrayItemKeys: [],
    })
  })

  it('marks invalid JSON', () => {
    expect(summarizeJsonShape('{')).toEqual({
      topLevelType: 'invalid-json',
      topLevelKeys: [],
      firstArrayItemKeys: [],
    })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --run src/import/jsonShape.test.ts
```

- [ ] **Step 3: Implement key-only summarization**

Create `src/import/jsonShape.ts`:

```ts
import type { JsonShapeSummary } from '../domain/models'

export function summarizeJsonShape(text: string): JsonShapeSummary {
  try {
    const value: unknown = JSON.parse(text)

    if (Array.isArray(value)) {
      const first = value[0]
      return {
        topLevelType: 'array',
        topLevelKeys: [],
        firstArrayItemKeys:
          first && typeof first === 'object' && !Array.isArray(first)
            ? Object.keys(first).sort()
            : [],
      }
    }

    if (value && typeof value === 'object') {
      return {
        topLevelType: 'object',
        topLevelKeys: Object.keys(value).sort(),
        firstArrayItemKeys: [],
      }
    }

    return {
      topLevelType: 'primitive',
      topLevelKeys: [],
      firstArrayItemKeys: [],
    }
  } catch {
    return {
      topLevelType: 'invalid-json',
      topLevelKeys: [],
      firstArrayItemKeys: [],
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/import/jsonShape.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/jsonShape*
git commit -m "feat: summarize export JSON structure safely"
```

---

### Task 8: Build the ChatGPT Export Import Inspector

**Files:**
- Create: `src/import/inspector.ts`
- Create: `src/import/inspector.test.ts`

**Interfaces:**
- Consumes:
  - `inspectZipEntries`
  - `summarizeJsonShape`
- Produces:
  - `inspectChatGptExport(file: File): Promise<InspectionReport>`

- [ ] **Step 1: Write failing inspector test**

Create `src/import/inspector.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { inspectChatGptExport } from './inspector'

describe('inspectChatGptExport', () => {
  it('reports structure but not transcript values', async () => {
    const bytes = await readFile('src/test/fixtures/inspector-fixture.zip')
    const report = await inspectChatGptExport(new File([bytes], 'export.zip'))
    const conversations = report.entries.find(e => e.path === 'conversations.json')

    expect(conversations?.category).toBe('json')
    expect(conversations?.jsonShape?.firstArrayItemKeys).toEqual([
      'id',
      'mapping',
      'title',
    ])

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('private title')
    expect(serialized).not.toContain('Example')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --run src/import/inspector.test.ts
```

- [ ] **Step 3: Implement the inspector**

Create `src/import/inspector.ts`:

```ts
import type {
  InspectionEntry,
  InspectionReport,
} from '../domain/models'
import { summarizeJsonShape } from './jsonShape'
import { inspectZipEntries } from './zipStream'

const JSON_INSPECTION_LIMIT = 2 * 1024 * 1024

function category(path: string): InspectionEntry['category'] {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (/\.(png|jpe?g|gif|webp|heic|pdf|mp4|mov|mp3|wav)$/i.test(lower)) return 'media'
  return 'other'
}

export async function inspectChatGptExport(file: File): Promise<InspectionReport> {
  const entries: InspectionEntry[] = []

  await inspectZipEntries(file, async entry => {
    const kind = category(entry.path)
    let jsonShape = null

    if (kind === 'json') {
      const text = await entry.streamText(JSON_INSPECTION_LIMIT)
      jsonShape = summarizeJsonShape(text)
    }

    entries.push({
      path: entry.path,
      compressedSize: entry.compressedSize,
      originalSize: entry.originalSize,
      category: kind,
      jsonShape,
    })
  })

  entries.sort((a, b) => a.path.localeCompare(b.path))

  return {
    sourceFileName: file.name,
    sourceFileSize: file.size,
    inspectedAt: new Date().toISOString(),
    entries,
  }
}
```

Important: if a huge JSON file's first 2 MiB cannot form valid JSON, `invalid-json` is expected in this first inspector. The UI must then identify it as requiring a streaming JSON-shape probe in the next parser plan rather than expanding the byte limit until memory becomes unsafe.

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/import/inspector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/inspector*
git commit -m "feat: inspect ChatGPT export structure"
```

---

### Task 9: Add Dropbox connection and Import Inspector UI

**Files:**
- Create: `src/features/settings/DropboxConnection.tsx`
- Create: `src/features/import/ImportInspectorPage.tsx`
- Create: `src/features/import/ImportInspectorPage.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `DropboxAuthService`
  - `inspectChatGptExport`
  - `ArchiveRepository.writeInspectionReport`
  - local `imports` table
- Produces: user-visible Dropbox connect flow and import-schema report.

- [ ] **Step 1: Write failing UI test**

Create `src/features/import/ImportInspectorPage.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportInspectorPage } from './ImportInspectorPage'

describe('ImportInspectorPage', () => {
  it('shows a privacy notice and inspects a selected ZIP', async () => {
    const inspect = vi.fn().mockResolvedValue({
      sourceFileName: 'export.zip',
      sourceFileSize: 100,
      inspectedAt: '2026-09-04T12:00:00Z',
      entries: [
        {
          path: 'conversations.json',
          compressedSize: 10,
          originalSize: 20,
          category: 'json',
          jsonShape: {
            topLevelType: 'array',
            topLevelKeys: [],
            firstArrayItemKeys: ['id', 'mapping', 'title'],
          },
        },
      ],
    })

    render(<ImportInspectorPage inspect={inspect} onSaveReport={vi.fn()} />)

    expect(
      screen.getByText(/does not save conversation text/i)
    ).toBeInTheDocument()

    const file = new File(['x'], 'export.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText(/chatgpt export zip/i), file)

    expect(await screen.findByText('conversations.json')).toBeInTheDocument()
    expect(screen.getByText(/id, mapping, title/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --run src/features/import/ImportInspectorPage.test.tsx
```

- [ ] **Step 3: Implement the page**

The page must:
- accept `.zip`
- show source filename and size
- show progress state
- show each entry path, size, category, and key-only JSON shape
- never render JSON values
- provide `Save Inspection Report to Dropbox`
- explain that this first inspection does not import or persist conversation text

Use dependency injection props for `inspect` and `onSaveReport`; do not instantiate Dropbox or Dexie inside the component.

- [ ] **Step 4: Add route from App shell**

Until a router is introduced in the UI plan, a hash check is sufficient:
- `#/` → Home placeholder
- `#/import` → Import Inspector

Do not add a routing dependency solely for this slice.

- [ ] **Step 5: Run tests**

```bash
npm test -- --run
npm run build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features src/app
git commit -m "feat: add export inspector interface"
```

---

### Task 10: Validate against a real ChatGPT export and capture the parser contract

**Files:**
- Create after inspection: `docs/import-schema/2026-09-04-chatgpt-export-shape.md`
- Create from sanitized structural data: `src/test/fixtures/chatgpt-export-shape.json`
- Modify only if required by observed structure: `src/import/inspector.ts`

**Interfaces:**
- Consumes: the completed Import Inspector and one real official ChatGPT export ZIP.
- Produces: an evidence-based schema document that the next implementation plan will use.
- Does **not** produce a conversation parser yet.

- [ ] **Step 1: Run the app locally in a secure browser context**

```bash
npm run dev
```

Open the Import Inspector and choose the real ChatGPT export ZIP.

- [ ] **Step 2: Record only structural facts**

The generated schema note must contain:
- source ZIP total size
- ZIP entry paths
- entry compressed/original sizes
- JSON top-level type
- top-level key names
- first-record key names where safely observable
- whether conversation data is one JSON file, multiple numbered JSON files, or another layout
- filenames/patterns for attachments
- filenames/patterns for Project-related data if present
- filenames/patterns for archived/pinned metadata if present

It must **not** contain:
- prompt text
- assistant reply text
- notes
- personal names extracted from chats
- message IDs copied solely for examples
- attachment contents

- [ ] **Step 3: Create a sanitized structural fixture**

Create `src/test/fixtures/chatgpt-export-shape.json` containing the same keys and nesting shape but invented values such as:

```json
{
  "id": "conv-fixture-1",
  "title": "Fixture Conversation",
  "create_time": 0,
  "update_time": 0,
  "mapping": {}
}
```

The exact keys must match the real observed schema; invented sample values prevent private transcript content entering the repository.

- [ ] **Step 4: Run the full test suite again**

```bash
npm test -- --run
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit the schema evidence, not the source export**

```bash
git add docs/import-schema src/test/fixtures/chatgpt-export-shape.json
git commit -m "docs: record ChatGPT export schema"
```

Explicitly verify the 4 GB ZIP is **not** staged:

```bash
git status --short
```

Expected: no source ZIP path appears.

---

## Completion Gate

This plan is complete only when all of the following are true:

- The PWA builds successfully.
- Unit/component tests pass.
- Dropbox connects through PKCE without an embedded secret.
- Dropbox access is restricted to the app's configured scope.
- A large export can be inspected without `File.arrayBuffer()` on the whole ZIP.
- The inspection report contains structural metadata only, not transcript bodies.
- A real ChatGPT export has been inspected.
- The observed export schema has been documented with sanitized fixtures.
- No real ChatGPT export, prompt/reply text, OAuth token, or private attachment content is committed to the repository.

## Next Plans

Do not start these until this plan's schema gate is complete.

1. **Archive Import & Merge Plan**
   - schema-specific ChatGPT parser
   - canonical conversation model
   - Markdown/JSON generation
   - import preview
   - transaction/staging design
   - latest/previous ZIP retention
   - attachment hashing/deduplication

2. **Search & Retrieval Plan**
   - MiniSearch index construction
   - message-level search documents grouped to conversations
   - fuzzy/prefix search and field boosts
   - filters and saved searches
   - jump-to-message
   - iPhone lightweight/full-index modes

3. **Organization & Sync Plan**
   - folders, tags, star, notes, custom titles
   - reviewed/unreviewed
   - metadata backups
   - Dropbox conflict handling
   - offline mutation queue
   - bulk actions

4. **Reader, Attachments & Recovery Plan**
   - transcript reader
   - attachment browser
   - Open in ChatGPT
   - Archive Health
   - Verify/Rebuild/Restore
   - Markdown/JSON/ZIP export
   - PWA hardening and device testing
