# Archive — v0.2.2 Conversation Importer

Archive is a privacy-first PWA for searching, organizing, and preserving ChatGPT history. v0.2.2 is the first build that performs a **real conversation import**.

## What v0.2.2 does

- Reads the official ChatGPT export ZIP locally in the browser.
- Handles ZIP64 exports without loading the multi-gigabyte ZIP into memory.
- Reads the observed 2026 sharded conversation files (`conversations-000.json`, etc.) one at a time.
- Reconstructs the active conversation branch from `current_node` and node `parent` links.
- Preserves the complete source conversation object as canonical JSON.
- Generates a readable Markdown copy containing user/assistant-visible text only.
- Does **not** put internal thought/tool/system/developer structures into the readable transcript.
- Fingerprints each source conversation with SHA-256.
- Compares the export with `/System/archive-index.json` in Dropbox and previews:
  - new conversations
  - updated conversations
  - unchanged conversations
  - conversations not present in the latest export
- Never deletes a conversation merely because it is absent from a later export.
- Warns before committing an anomalously large disappearance.
- Imports file metadata from `library_files.json` and links records back to conversations when the export provides thread/message IDs.
- Stores changed conversation versions in Dropbox using content-addressed filenames.
- Writes the archive index **last**, making it the commit point for the import.
- Mirrors the committed archive index into local IndexedDB as rebuildable derived data.

## v0.2.2 deliberately does not yet

- upload the 3+ GB of binary `.dat` attachment payloads
- retain `latest.zip` / `previous.zip` in Dropbox
- build the full-text search interface
- reconstruct ChatGPT Projects unless the export supplies a verified direct mapping

Those are subsequent v0.2.x / search milestones. The deep inspection showed no direct `project_id` in the observed conversation schema, so Archive does not guess.

## Deploy to GitHub Pages

1. Upload the **contents of this folder** to the root of the `Archive` repository.
2. In GitHub, open **Settings → Pages**.
3. Deploy from `main` and `/root`.
4. Reload the deployed Archive site after GitHub Pages finishes publishing.

## Dropbox setup

Archive needs Dropbox before it can commit an import.

Create a Dropbox API app with:

- Scoped access
- **App Folder** content access
- file read/write scopes needed by Archive
- the exact deployed Archive URL registered as an OAuth redirect URI

In Archive → **Settings**, paste the Dropbox **App Key** and choose **Connect Dropbox**.

The App Key is public OAuth client configuration. Do not put a Dropbox App Secret in Archive. The browser uses PKCE and stores only a short-lived Dropbox access token.

## First real import

1. Open **Import**.
2. Choose the official ChatGPT export ZIP.
3. Select **Analyze Export**.
4. Wait while Archive reads the conversation shards and file metadata locally.
5. Review the import preview.
6. If Dropbox is connected, select **Import Conversations to Dropbox**.
7. Leave the tab open until Archive reports that the index was committed.

For the first import, every conversation will be **new**. On later exports, Archive will upload only new or changed conversation versions.

## Dropbox layout in this build

```text
Archive/
├── Conversations/
│   └── <conversation-id>--<sha256>.json
├── Markdown/
│   └── <conversation-id>--<sha256>.md
└── Attachments/
    └── index.json

System/
└── archive-index.json
```

The filenames are content-addressed so existing committed versions are not overwritten before the new archive index is successfully written.

## Tests

No npm packages are required.

```bash
npm test
```

The core parser, ZIP64 reader, active-branch reconstruction, privacy filtering, merge logic, Dropbox repository, PKCE flow, and UI rendering are covered with Node's built-in test runner.


## v0.2.2 cache recovery

If a previous service worker serves an older Archive build after the local database has already upgraded, visit `reset.html` once. It unregisters Archive service workers and clears only `archive-shell-*` caches; it does not delete IndexedDB or Dropbox settings.
