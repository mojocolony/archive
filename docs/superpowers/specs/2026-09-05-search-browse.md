# Archive v0.2.4 — Search & Browse Specification

## Goal
Make the already-committed Dropbox archive usable: browse all archived conversations, build a disposable local full-text index, search conversation-level results with matching excerpts, and open a readable archived transcript.

## Approved product constraints

- Dropbox remains the only cloud service. Conversation text is not copied to any hosted database.
- Search/indexing happens locally on the device and the local index is disposable/rebuildable.
- The canonical Dropbox archive remains unchanged by search/index creation.
- Search results are conversation-level, with matching prompt/reply excerpts beneath each result.
- Opening a result opens the archived transcript and can jump to the matching message.
- Home keeps a prominent universal search field and a restrained library-style interface.
- The conversation library is a list, not a card grid.
- The source ChatGPT title is preserved; custom Archive metadata remains separate (custom-title editing is not part of this slice).
- v0.2.4 does not add folders, tags, notes, saved searches, attachment browsing, or semantic embeddings.
- The app must continue to handle the existing v0.2.3 IndexedDB database without destructive resets.
- The first index build may read archived conversation JSON from Dropbox; future index rebuilds must remain an explicit local operation.
- The UI should stop displaying the giant source ZIP filename as the primary Home status detail.
- The Import preview label "Conversation files" should be renamed to "Source conversation JSON files".
- Adopt Lucide `package-open` as Archive's in-app and installed-PWA icon.

## Search behavior in this slice

- Search titles and visible user/assistant message text.
- Case-insensitive.
- Support normal terms, quoted phrases, partial-word matches, and light typo tolerance.
- Rank title matches above message matches; user-message matches above assistant-message matches; use recency only as a tie-breaker.
- Return one row per conversation.
- Show up to two useful matching excerpts per result.
- Search does not leave the device.

## Local index shape

Each local search document stores only data derivable from the Dropbox archive and may be deleted/rebuilt:

- conversationId
- title
- createTime / updateTime
- archived/starred/pinned/presence flags
- sourcePath
- visible messages: message id, role, text, timestamp
- normalized searchable title/text helpers

The index is stored in IndexedDB. Archive-owned metadata remains in its existing independent store.

## Initial-index workflow

- If a committed archive exists but no current local index exists, Home shows `Build Local Search Index`.
- Building downloads conversation JSON from the paths in the committed archive index with bounded concurrency and visible progress.
- Each document is written incrementally to IndexedDB.
- A search-metadata record records the archive index timestamp/count used to build it.
- If the Dropbox archive changes, Home marks the local index as out of date and offers `Rebuild Local Search Index`.
- A failed/interrupted build must never modify the Dropbox archive; rebuilding clears/replaces only local search documents.

## Browse and transcript routes

- `#/conversations` — all locally indexed conversations, newest updated first.
- `#/conversation/<encoded conversation id>` — readable archived transcript.
- Home search result links may include `?q=` and `?m=` in the hash route so the transcript can highlight/jump to a relevant message.

## Icon

Use the Lucide `package-open` geometry from Lucide's published icon. In-app mark uses the stroke icon. PWA raster icons should use the same symbol centered with adequate safe area so installed icons are crisp rather than a tiny raw glyph.
