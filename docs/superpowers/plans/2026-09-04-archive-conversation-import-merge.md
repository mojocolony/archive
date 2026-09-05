# Archive Conversation Import & Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v0.1.1 inspector into a real conversation importer that parses the observed 2026 ChatGPT export locally, previews new/updated/missing conversations, and commits versioned canonical conversation JSON/Markdown plus file metadata to Dropbox with the archive index written last as the commit point.

**Architecture:** The browser continues to read the ZIP by slicing individual entries, never loading the whole export. Conversation shards are fully decompressed one at a time, parsed into source objects, fingerprinted, and reduced into derived active-branch metadata for preview/Markdown. Dropbox stores content-addressed conversation versions as flat `<conversation-id>--<fingerprint>` filenames in `/Archive/Conversations` and `/Archive/Markdown`; `/System/archive-index.json` is the authoritative commit pointer so a failed upload cannot silently replace the previous index.

**Tech Stack:** Browser-native JavaScript modules, File/Blob slicing, `DecompressionStream`, Web Crypto SHA-256, IndexedDB, Dropbox HTTP API with existing PKCE session, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-archive-v1-design.md`

## Global Constraints

- Dropbox remains the only cloud service.
- No full ZIP read; decompress only selected entries, one entry at a time.
- Original conversation source objects are preserved unchanged inside canonical JSON files.
- Readable Markdown excludes internal thoughts, tool/system/developer messages, and other non-user-visible structures.
- ChatGPT Project membership is not inferred from unverified fields.
- Missing conversations are marked `presentInLatestExport: false`; never delete them automatically.
- Archive-owned metadata is not touched by source imports.
- Canonical writes are content-addressed; the archive index is uploaded last as the commit point.
- Attachment binaries and source-export ZIP retention are not uploaded in v0.2.0; file metadata and linkage are imported now, with binary/source retention remaining the next v0.2.x slice.
- ZIP filename and top-level folder in delivered packages must match exactly, apart from `.zip`.

---

### Task 1: Full per-entry ZIP reads

**Files:**
- Modify: `src/import/zipDirectory.js`
- Test: `tests/zip-inspector.test.js`

**Produces:**
- `readEntryBytes(file, entry): Promise<Uint8Array>`
- `readEntryText(file, entry): Promise<string>`

Steps: write tests proving a full deflated entry can be read while `File.arrayBuffer()` throws; implement full entry streaming for methods 0 and 8; rerun ZIP tests.

### Task 2: Conversation parser and active branch

**Files:**
- Create: `src/import/conversationParser.js`
- Test: `tests/conversation-parser.test.js`

**Produces:**
- `activeNodePath(conversation)`
- `visibleMessages(conversation)`
- `conversationToMarkdown(conversation)`
- `fingerprintConversation(conversation)`

Rules: traverse from `current_node` through `parent`; preserve source mapping but render only `user` and `assistant` messages with extractable visible text; skip internal `thoughts` content; detect cycles/missing current nodes without guessing.

### Task 3: Export parser and attachment metadata linkage

**Files:**
- Create: `src/import/exportParser.js`
- Test: `tests/export-parser.test.js`

**Produces:**
- `parseChatGptExport(file, options)` returning conversations, attachment metadata, source-name map, warnings, and parse statistics.

Rules: select sharded `conversations-NNN.json` files in numeric order, support legacy `conversations.json`, parse `library_files.json` and `conversation_asset_file_names.json` when present, map file records to conversations using thread/initiation IDs and message-ID fallback.

### Task 4: Import preview and merge index

**Files:**
- Create: `src/import/importMerge.js`
- Test: `tests/import-merge.test.js`

**Produces:**
- `buildImportPreview(parsedExport, previousIndex)`
- `buildCommittedIndex(parsedExport, previousIndex, importContext)`

Rules: classify new/updated/unchanged by fingerprint; preserve prior entries missing from the new export and mark them absent; expose anomaly warning when more than 20% (minimum 25) of previously present conversations disappear.

### Task 5: Dropbox canonical repository

**Files:**
- Modify: `src/dropbox/archiveRepository.js`
- Test: `tests/dropbox-repository.test.js`

**Produces:**
- `getArchiveIndex()`
- `saveConversationVersion()`
- `saveAttachmentMetadata()`
- `saveArchiveIndex()`
- `ensureArchiveStructure()`

Rules: version files by `<fingerprint>.json` and `<fingerprint>.md`; upload index last; treat missing remote index as an empty archive.

### Task 6: Local schema upgrade

**Files:**
- Modify: `src/local/db.js`
- Test: `tests/db-schema.test.js`

Add an `archiveIndex` store and bump database version. Keep it derived/rebuildable.

### Task 7: Import UI and controller

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`
- Modify: `src/appLogic.js`
- Modify: `src/styles.css`
- Test: `tests/ui-render.test.js`
- Test: `tests/app-controller.test.js`
- Test: `tests/app-logic.test.js`

Flow: choose ZIP -> Analyze Export locally -> preview counts -> Import to Dropbox -> progress -> completion. Keep the safe-schema-report download available under a Diagnostics disclosure, but no longer make it the primary task.

### Task 8: Version, service worker, README, packaging

**Files:**
- Modify: `package.json`
- Modify: `sw.js`
- Modify: `README.md`
- Update: `docs/import-schema/2026-09-04-chatgpt-export-shape.md`

Set version to `0.2.0`. Cache new modules. Document that v0.2.0 imports conversation JSON/Markdown and attachment metadata but does not yet upload binary attachments or retain the source ZIP. Run the full test suite and syntax checks. Package as `Archive-v0.2.0-Conversation-Importer.zip` containing one top-level folder named exactly `Archive-v0.2.0-Conversation-Importer`.
