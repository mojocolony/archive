# Archive — v1 Design Specification

**Status:** Approved baseline  
**Date:** 2026-09-04

## Purpose

Archive is a privacy-first PWA for finding, reading, organizing, and preserving ChatGPT conversations and associated files. It supplements ChatGPT rather than replacing it.

The priority order is:

**Retrieval → integrity → privacy → organization → portability → additional intelligence.**

## Core architecture

- PWA.
- Dropbox is the only cloud service in v1.
- No Supabase, Firebase, hosted transcript database, or external AI indexing service.
- Original ChatGPT data is never modified.
- Dropbox contains the canonical archive and Archive-specific metadata.
- Local device indexes are disposable derived data and can be rebuilt from Dropbox.
- Mac and iPad maintain full-text indexes by default.
- iPhone maintains a lightweight metadata index by default with optional full-text indexing.

## Import and merge

Archive imports official ChatGPT data-export ZIP files.

Import workflow:

1. Choose ZIP.
2. Scan without modifying the current archive.
3. Preview changes.
4. Approve import.
5. Merge.
6. Verify.
7. Update source-ZIP backups.

The ChatGPT conversation ID is the preferred stable identifier. Existing conversations update in place; new conversations are added; Archive-owned metadata survives re-imports. Conversations absent from a newer export are flagged, not automatically deleted.

Import operations must be transactional in spirit. A malformed, interrupted, or suspiciously small import must not damage the existing archive.

## Source ZIP retention

Default:
- Keep latest ZIP.
- Keep previous ZIP.
- Remove older redundant ZIPs only after the new import verifies successfully.
- Allow a source export to be marked Keep Permanently.

The canonical archive is incremental.

## Dropbox archive

Human-readable and structured copies are retained. Conceptually:

```text
ChatGPT Archive/
├── Archive/
│   ├── Conversations/
│   ├── Attachments/
│   └── Metadata/
├── Source Exports/
│   ├── latest.zip
│   └── previous.zip
└── System/
    ├── imports.json
    ├── folders.json
    ├── tags.json
    └── saved-searches.json
```

Conversation filenames use stable conversation IDs rather than mutable titles. JSON is the app representation; Markdown provides a human-readable escape hatch. Attachments are deduplicated by content hash where practical.

Archive-specific metadata receives lightweight versioned backups.

## Main navigation

Desktop/iPad sidebar:
- Home
- All Conversations
- Projects
- Starred
- Folders
- Tags
- Attachments
- Saved Searches
- Archived
- Needs Organizing
- Import History

iPhone primary navigation:
- Search
- Recent
- Starred
- Browse

## Home

Home contains:
- Universal search
- Recent
- Starred
- Recently Imported
- Needs Organizing
- Import status

No charts or decorative analytics are required in v1.

## Search

Search indexes:
- custom titles
- original ChatGPT titles
- prompts
- ChatGPT replies
- notes
- tags
- folders
- Project names
- attachment filenames

V1 supports:
- words and quoted phrases
- prefix/partial matching
- typo tolerance/fuzzy matching
- date, Project, folder, tag, star, attachment filters
- combined filters
- direct jump to matching messages
- search within a conversation
- saved searches

Results are grouped by conversation with matching message excerpts.

Semantic search is postponed, but the indexing architecture must allow a local semantic layer later.

## Conversation view

Main pane:
- clean prompt/reply transcript
- attachments in context
- highlighted search hits

Collapsible metadata pane:
- custom title
- original title
- original Project
- folder
- tags
- star
- note
- source status
- timestamps
- attachments
- Open in ChatGPT where possible

## Organization

Preserve original ChatGPT organization separately from Archive organization.

Archive v1 has:
- one one-level folder per conversation
- unlimited tags
- star
- one searchable Markdown note
- optional custom title
- reviewed/unreviewed state
- saved searches
- bulk organization

Every new import starts Unreviewed. Reviewed does not require a folder or tags.

Local tag suggestions are advisory only and should favour existing tags.

## Attachments

Attachments have a lightweight global view with:
- filename
- type
- image thumbnails where appropriate
- date
- parent conversation
- Project/folder/tag filters
- uploaded/generated distinction where determinable

Attachments remain subordinate to conversations. No independent attachment folder/tag model in v1.

## Cross-device sync

Dropbox syncs canonical archive and lightweight metadata. Local indexes remain per-device. Lightweight metadata changes should not force transcript-index rebuilds.

Offline users may search cached indexes, read cached conversations, and edit metadata. Pending changes sync on reconnection.

## Privacy and security

- Dropbox OAuth is the only cloud authentication.
- Prefer Dropbox App Folder access if sufficient.
- No Archive username/password system.
- Do not send transcript content to analytics, external search, AI classification, error reporting, or hosted databases.
- Diagnostics must never include transcript content.
- Local caches/indexes have explicit clear/rebuild controls.
- Client-side end-to-end encryption is postponed but should not be architecturally precluded.

## Recovery

Archive Health shows:
- Dropbox connection
- conversation count
- attachment storage
- last verification
- local index status

Recovery actions:
- Verify Archive
- Rebuild Local Data
- Restore Metadata Backup

Local loss must be recoverable from Dropbox.

## Deletion

Distinguish:
- Remove from dashboard
- Dashboard Trash
- Permanently Delete Archive Copy

None of these actions modify ChatGPT itself. Deletion in ChatGPT does not automatically delete the Archive copy.

## Open in ChatGPT

Where source information allows:
- Live in ChatGPT
- Archive only
- Unverified

A broken ChatGPT source link never blocks access to the archived transcript.

## Import reminder

Default reminder: 14 days. Options: 7, 14, 30, Off.

System notifications are not required in v1.

## Navigation state

Back/Forward navigation must preserve:
- query
- filters
- scroll position
- expanded result excerpts

## Basic export

V1 supports:
- conversation → Markdown
- conversation → JSON
- selected conversations → ZIP

## Explicitly excluded from v1

- semantic/AI search
- external embeddings
- automatic AI classification
- automatic folder assignment
- nested folders
- collections
- multiple users/collaboration
- native Apple apps
- Face ID/custom PIN
- client-side E2EE
- continuous live ChatGPT sync
- modifying/deleting ChatGPT conversations
- complex attachment management
- analytics dashboards
- automatic summaries/entity extraction

## Success criteria

V1 succeeds if a user with a large ChatGPT history can safely import the account archive, search prompt/reply content quickly, jump to exact matches, browse original Projects, add a simple independent organization layer, find attachments, preserve conversations outside ChatGPT, work across Mac/iPad/iPhone, recover from local data loss, and retain readable copies without depending on the app.
