# ChatGPT Export Shape — Observed 2026-09-04

Source: safe structural inspection report generated from the user's official ChatGPT export.

## Source archive

- ZIP size: 3,451,049,966 bytes.
- ZIP entry count: 2,336.
- The safe report intentionally omits the source attachment paths except as extension/count summaries.

## Conversation files

Conversation history is split across eight top-level JSON files:

- `conversations-000.json`
- `conversations-001.json`
- `conversations-002.json`
- `conversations-003.json`
- `conversations-004.json`
- `conversations-005.json`
- `conversations-006.json`
- `conversations-007.json`

Each is a top-level array. The first observed conversation record exposes these top-level keys:

- `conversation_id`
- `conversation_template_id`
- `create_time`
- `current_node`
- `default_model_slug`
- `id`
- `is_archived`
- `is_do_not_remember`
- `is_read_only`
- `is_starred`
- `is_study_mode`
- `mapping`
- `memory_scope`
- `pinned_time`
- `plugin_ids`
- `title`
- `update_time`
- `voice`

This confirms that Archive can preserve the original ChatGPT title, stable conversation identifiers, archive status, starred status, pinned time, timestamps, and current-node pointer directly from the conversation record.

The v1 inspection report does not expose the nested structure under `mapping`; a deeper redacted schema probe is required before implementing message parsing.

## File and attachment metadata

`conversation_asset_file_names.json` is a top-level object keyed by exported `.dat` asset identifiers. The first inspection did not expose the value shape, so the importer must not yet assume whether those values are strings or structured records.

`library_files.json` is a top-level array with rich file metadata. Observed fields include:

- `file_id`
- `file_name`
- `file_extension`
- `file_size_bytes`
- `mime_type`
- `sha256_digest`
- `client_sha256_digest`
- `initiating_conversation_id`
- `origination_message_id`
- `origination_thread_id`
- `context_scopes`
- `context_scopes_v2`
- `directory_id`
- `root_directory_id`
- `is_project`
- `pinned_at`
- `trashed_at`
- `thumbnail_sources`
- `image_gen_generation_id`

These fields are promising for linking files to conversations/messages and for deduplication, but actual relationship values remain deliberately redacted in this report.

## Other structural files

- `shared_conversations.json`: array with `conversation_id`, `id`, `is_anonymous`, and `title`.
- `message_feedback.json`: array linked by `conversation_id`.
- `export_manifest.json`: object containing `export_files`, `logical_files`, `manifest_file`, and `version`.
- `user.json` and `user_settings.json` are present but are not required for the core Archive importer.

No dedicated top-level `projects.json` file appears in the structural report. Project membership therefore remains unresolved pending the deeper redacted probe of conversation and file metadata.

## Asset volume

The safe report summarizes non-structural entries as:

- `.dat`: 2,256 files, 3,606,954,442 uncompressed bytes
- `.bundle`: 2 files, 3,552,285 bytes
- `.bin`: 2 files, 27,452 bytes
- `.json`: 58 files, 45,234 bytes
- `.sql`: 1 file, 1,209 bytes

The archive size is therefore dominated by `.dat` assets, making deduplication and selective attachment extraction important.

## Required next probe

The enhanced inspector must capture schema/type information only for:

1. the first complete conversation object;
2. one `mapping` node value;
3. nested `message`, `author`, `content`, and `metadata` objects;
4. the first value in `conversation_asset_file_names.json`;
5. the first `library_files.json` record with types for relationship fields.

No IDs, titles, filenames, prompts, replies, or other values should be emitted.
