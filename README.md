# Archive — v0.3.1 Instant Tag Save

Archive is a privacy-first local/Dropbox dashboard for ChatGPT exports.

## What v0.3.1 changes

Organization edits are now optimistic. Adding a tag with Return or **Add Tag**, removing a tag, or changing an Archive star updates IndexedDB and the visible Archive UI immediately. Dropbox synchronization continues in the background.

Background organization writes are serialized so several quick edits cannot arrive out of order and overwrite a newer tag/star state with an older one. If Dropbox synchronization fails, Archive keeps the local edit visible and shows a warning explaining that the change was saved locally but did not sync.

## Existing v0.3.x organization features

- Archive-owned stars, separate from ChatGPT-exported starred state.
- Multiple Archive tags per conversation.
- Starred and Tags sidebar views.
- Tags included in the local search index.
- Canonical Archive organization metadata stored separately in Dropbox at `/System/conversation-metadata.json`.
- **Open in ChatGPT ↗** opens the source conversation in a new tab using the exported conversation ID.

## Important scope notes

Archive still treats the committed Dropbox conversation archive as canonical evidence. Search indexes and the local organization cache are disposable local layers. ChatGPT import data is never modified by starring or tagging a conversation in Archive.

Binary attachment upload and latest/previous source-export ZIP retention remain future work.

## Deploy

Upload the contents of the `Archive-v0.3.1-Instant-Tag-Save` folder to the root of the `mojocolony/archive` GitHub repository and let GitHub Pages deploy normally. Open Archive and confirm **v0.3.1** in the lower-left corner.

No search-index rebuild is required for this update.
