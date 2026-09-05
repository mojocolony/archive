# Archive v0.2.4 Search & Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the committed Dropbox archive into a locally searchable and browsable conversation library with readable transcripts.

**Architecture:** Add a disposable IndexedDB `searchDocuments` store and small search engine module. Build the index explicitly from canonical Dropbox conversation JSON, then drive Home search, All Conversations, and transcript routes entirely from local data. Search never writes transcript data back to Dropbox.

**Tech Stack:** Static ES modules, IndexedDB, Dropbox HTTP API, Node built-in test runner, CSS, SVG/PNG PWA assets.

**Spec:** `docs/superpowers/specs/2026-09-05-search-browse.md`

## Global Constraints

- Version is `0.2.4`.
- Dropbox remains the only cloud service.
- Search/index data is local, disposable, and rebuildable.
- Do not destructively reset or clear existing Archive settings/import/archiveIndex data.
- Do not upload search indexes or search queries to Dropbox.
- Keep the app deployable as static files on GitHub Pages at `/archive/`.
- Adopt Lucide `package-open` everywhere an Archive app icon is shown.
- Top-level folder inside the final ZIP must exactly match the ZIP filename minus `.zip`.

---

### Task 1: Local search document schema and index builder

**Files:**
- Create: `src/search/searchIndex.js`
- Modify: `src/local/db.js`
- Modify: `src/dropbox/archiveRepository.js`
- Test: `tests/search-index.test.js`
- Test: `tests/db-schema.test.js`
- Test: `tests/dropbox-repository.test.js`

**Interfaces:**
- Consumes: `visibleMessages(sourceConversation)` from `src/import/conversationParser.js`; committed archive index entries with `sourcePath`.
- Produces: `buildSearchDocument(indexEntry, source)`, `searchDocuments(documents, query, options)`, and Dropbox `getConversationSource(path)`.

- [ ] **Step 1: Write failing tests for search document construction, term/phrase/partial/fuzzy matching, ranking, excerpts, DB v3 store, and generic conversation-source download.**
- [ ] **Step 2: Run the focused tests and verify they fail for missing implementation.**
- [ ] **Step 3: Implement the minimal search-index module, add `searchDocuments` and `searchMeta` stores in DB v3, and add repository conversation JSON download.**
- [ ] **Step 4: Run focused tests and make them pass.**

### Task 2: Search-index build service with bounded concurrency and staleness metadata

**Files:**
- Create: `src/search/indexService.js`
- Test: `tests/search-index-service.test.js`

**Interfaces:**
- Consumes: `repository.getConversationSource(path)`, `db.put/getAll/clear`, committed index.
- Produces: `buildLocalSearchIndex({ archiveIndex, repository, db, onProgress, concurrency })`, `getLocalSearchStatus({ archiveIndex, db })`.

- [ ] **Step 1: Write failing tests for incremental index build, bounded concurrency, progress, failure safety, and stale/current detection.**
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Implement the build/status service; clear only disposable search stores when rebuilding.**
- [ ] **Step 4: Run focused tests and make them pass.**

### Task 3: Routes, Home search, library list, and transcript view

**Files:**
- Modify: `src/appLogic.js`
- Modify: `src/app.js`
- Modify: `src/ui.js`
- Modify: `src/styles.css`
- Test: `tests/app-logic.test.js`
- Test: `tests/ui-render.test.js`
- Test: `tests/ui-shell.test.js`
- Test: `tests/app-controller.test.js`

**Interfaces:**
- Consumes: local search docs/status from Tasks 1–2.
- Produces: `#/conversations`, `#/conversation/<id>`, Home search results, transcript deep links.

- [ ] **Step 1: Write failing tests for route parsing, Home index states, search-result rendering, All Conversations list, transcript rendering, simplified import status, and source-shard label.**
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Implement routes and handlers, explicit Build/Rebuild Local Search Index flow, local search, result links, conversation list, and transcript view.**
- [ ] **Step 4: Add restrained responsive styles for progress, result rows, excerpts, transcript roles, and mobile layout.**
- [ ] **Step 5: Run focused tests and make them pass.**

### Task 4: Package-open icon and PWA/version integration

**Files:**
- Create: `public/icons/package-open.svg`
- Replace: `public/icons/archive-192.png`
- Replace: `public/icons/archive-512.png`
- Modify: `public/manifest.webmanifest`
- Modify: `index.html`
- Modify: `src/ui.js`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/ui-shell.test.js`
- Test: `tests/service-worker.test.js`

**Interfaces:**
- Produces: crisp Lucide `package-open` identity in-app and in installed PWA; v0.2.4 cache namespace/version.

- [ ] **Step 1: Add failing tests asserting v0.2.4, Package Open brand SVG, manifest icon assets, and service-worker cache bump.**
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Add the exact Lucide Package Open SVG geometry and generate 192/512 PNG icons with safe area; update app shell, manifest, HTML metadata, package version, README, and service worker.**
- [ ] **Step 4: Run focused tests and make them pass.**

### Task 5: Full regression, static syntax check, package validation

**Files:**
- Final artifact: `Archive-v0.2.4-Search-Browse.zip`

**Interfaces:**
- Produces: upload-ready GitHub Pages source folder and matching ZIP.

- [ ] **Step 1: Run `npm test` and require all tests to pass.**
- [ ] **Step 2: Run `node --check` on every JavaScript source/test/service-worker file.**
- [ ] **Step 3: Scan source for obvious pasted export identifiers/secrets and verify none are present.**
- [ ] **Step 4: ZIP the folder so the archive contains exactly `Archive-v0.2.4-Search-Browse/` at top level.**
- [ ] **Step 5: Validate ZIP listing and re-run tests from the packaged folder.**
