# Archive — v0.2.4 Search & Browse

Archive is a privacy-first PWA for searching, organizing, and preserving ChatGPT history. The canonical conversation archive lives in Dropbox; the full-text search index is disposable local data that stays on the device.

## What v0.2.4 adds

- Builds a full-text local search index from the committed Dropbox archive.
- Keeps prompt/reply search data in IndexedDB on the current device; it is not uploaded as a search database.
- Searches conversation titles, user prompts, and ChatGPT replies.
- Supports quoted phrases, partial words, and light typo tolerance.
- Ranks title matches first, then user-message matches, then assistant-message matches.
- Returns one result per conversation with up to two matching excerpts.
- Opens the archived transcript and jumps to the matching message when possible.
- Adds an **All Conversations** library sorted by most recently updated.
- Shows archived/starred/archive-only state when present in the export/archive index.
- Simplifies Home to show conversation count and last-import date instead of the giant ZIP filename.
- Clarifies resumed-import reporting as **reused / uploaded / total committed**.
- Renames the import diagnostic to **Source conversation JSON files**.
- Uses Lucide `package-open` as the Archive in-app and installed PWA icon.

## Search privacy model

The Dropbox archive is the durable source of truth. When **Build Local Search Index** is selected, Archive downloads each canonical conversation JSON file from its own Dropbox app folder, extracts the visible active-branch user/assistant text, and writes a disposable search document to local IndexedDB.

The search index:

- stays on the current device
- can be rebuilt from Dropbox
- is marked stale when the committed archive changes
- does not replace or modify the canonical Dropbox archive

If an index build fails, Archive does not mark the partial index current.

## Existing import behavior retained

- Reads the official ChatGPT export ZIP locally in the browser.
- Handles ZIP64 exports without loading the multi-gigabyte ZIP into memory.
- Reads sharded conversation files such as `conversations-000.json` one at a time.
- Reconstructs the active conversation branch from `current_node` and node `parent` links.
- Stores complete source conversation JSON plus readable Markdown in Dropbox.
- Fingerprints each source conversation with SHA-256.
- Merges later exports and preserves missing conversations rather than deleting them.
- Imports attachment metadata and links it to conversations where reliable IDs exist.
- Resumes partial imports by reusing complete content-addressed JSON/Markdown pairs already in Dropbox.
- Uses bounded Dropbox concurrency, request timeouts, and transient-error retries.
- Writes `/System/archive-index.json` last as the import commit point.

## Deliberately not in this build

- binary `.dat` attachment payload upload
- latest/previous source-ZIP retention in Dropbox
- folders, tags, notes, saved searches, or bulk organization
- semantic/vector search
- reconstructed ChatGPT Project membership unless a reliable mapping is available

## Deploy to GitHub Pages

1. Upload the **contents of this folder** to the root of the `Archive` repository.
2. Wait for GitHub Pages to finish deploying.
3. Open Archive and confirm **v0.2.4** in the lower-left corner.
4. Home should show the committed conversation count.
5. Select **Build Local Search Index** and leave the tab open for the first build.
6. When indexing completes, use the Home search box or **All Conversations**.

## Dropbox setup

Archive uses a Dropbox API app with:

- Scoped access
- **App Folder** content access
- file read/write permissions required by Archive
- the exact deployed Archive URL registered as an OAuth redirect URI

In Archive → **Settings**, save the Dropbox **App Key** and connect with OAuth PKCE. Do not put a Dropbox App Secret in the PWA.

## Dropbox layout

```text
Archive/
├── Conversations/
│   └── <conversation-id>--<sha256>.json
├── Markdown/
│   └── <conversation-id>--<sha256>.md
└── Attachments/
    └── index.json

System/
├── archive-index.json
└── imports.json
```

## Local IndexedDB

The v0.2.4 database schema includes disposable stores for:

- `searchDocuments`
- `searchMeta`

The database is upgraded to schema version 3 without intentionally deleting the existing Archive settings, import history, or local archive-index mirror.

## Tests

No npm packages are required.

```bash
npm test
```

The suite covers ZIP parsing, active-branch reconstruction, import merge/commit safety, Dropbox PKCE/repository behavior, resilient import, local search indexing, ranking/query behavior, browse/transcript rendering, service-worker update safety, and PWA metadata.

## Cache recovery

If an old service worker ever serves stale Archive code after a local database upgrade, visit `reset.html` once. It unregisters Archive service workers and clears only Archive application-shell caches; it does not delete IndexedDB or Dropbox settings.
