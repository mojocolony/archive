# Archive — v0.3.0 Organization & Source Links

Archive is a privacy-first PWA for searching, organizing, and preserving ChatGPT history. The canonical conversation archive and Archive-owned organization metadata live in Dropbox; the full-text search index remains disposable local data on each device.

## What v0.3.0 adds

- **Archive stars** on search results, conversation lists, and transcript pages.
- A **Starred** sidebar view containing conversations starred inside Archive.
- Multiple **tags** per conversation, with add/remove controls on the transcript page.
- A **Tags** sidebar directory with conversation counts and filtered tag views.
- Tag text participates in local Archive search.
- Stars and tags are stored separately from the imported ChatGPT conversation record, so later ChatGPT exports cannot overwrite them.
- Archive organization metadata syncs through `/System/conversation-metadata.json` in the Dropbox app folder.
- **Open in ChatGPT** opens the original private conversation URL in a new browser tab using the exported conversation ID. If the source chat no longer exists or ChatGPT changes its private URL format, the archived copy remains available.
- Imported ChatGPT star state remains distinguishable as **ChatGPT Starred**; it is not the same as an Archive star.

## Search behavior retained

- Full-text local search across conversation titles, user prompts, and ChatGPT replies.
- Exact and one-way partial matches are preferred.
- Fuzzy typo matching is used only when no strict results exist.
- Quoted phrases are supported.
- One result is returned per conversation with matching excerpts.
- Search stays in local IndexedDB and is not uploaded as a search database.

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
├── conversation-metadata.json
└── imports.json
```

`conversation-metadata.json` is Archive-owned data. The original imported conversation JSON remains unchanged.

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

## Deploy to GitHub Pages

1. Upload the **contents of this folder** to the root of the `Archive` repository.
2. Wait for GitHub Pages to finish deploying.
3. Open Archive and confirm **v0.3.0** in the lower-left corner.
4. Existing local search indexes do not need rebuilding merely to use stars and tags.
5. Open a conversation to add tags or star it, or use the star control directly from a list/search result.

## Dropbox setup

Archive uses a Dropbox API app with Scoped access and **App Folder** content access. In Archive → **Settings**, save the Dropbox **App Key** and connect with OAuth PKCE. Do not put a Dropbox App Secret in the PWA.

## Deliberately not in this build

- binary `.dat` attachment payload upload
- latest/previous source-ZIP retention in Dropbox
- folders, notes, saved searches, or bulk organization
- semantic/vector search
- reconstructed ChatGPT Project membership unless a reliable mapping is available

## Tests

No npm packages are required.

```bash
npm test
```

The suite covers ZIP parsing, import safety, Dropbox PKCE/repository behavior, resilient import, local search, organization metadata, stars/tags, transcript/source-link rendering, service-worker update safety, and PWA metadata.
