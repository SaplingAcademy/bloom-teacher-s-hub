# Personal notes
- Use only workspace_notes with the existing session client and RLS; freshly validate Auth identity and owner-filter writes so drafts never supply user_id.
- Board (≥768px) positions come only from workspace_notes.pos_x/pos_y (both NULL = automatic slot from the existing order, never written); drags are local Pointer Events state and save one snapped, board-clamped position on release, rolled back on failure. Below 768px keep the stacked grid without drag.
- `pinned` means "position locked" (not draggable); "front/back" moves one row past all notes through order_index (stacking order). Never mass-update positions or pinned; the board keeps its automatic slot order stable within a session.
- Serialize optimistic mutations per owner-scoped Query cache, cancel stale reads and roll back failures; retain the create editor UUID across retries to avoid duplicate notes.
- Render note content as React text only, never HTML, and reuse semantic note tokens and PT/EN dictionaries so stored colors and content remain unchanged.
# Personal projects
- Projects use only workspace_projects/phases/items through `workspace-projects-data.ts`; every read/write re-verifies Auth and filters by owner and project, and updates never send user_id/project_id.
- Progress is always derived in pure `workspace-projects.ts` from task/checklist items (0% when empty) and never stored; phase deletion relies on the FK SET NULL and the optimistic cache mirrors it.
- Detail mutations are serialized per owner/project cache with optimistic apply and snapshot rollback; link URLs are http(s)-only in meta.url and re-validated before rendering.
# Personal notebooks
- Notebook-only `NotebookFormatting` overrides shared `toggleList`, preserving unselected items and nested content while keeping toolbar/native shortcuts consistent; mouse presses on toolbar controls preserve the editor selection.
- Notebooks/pages use only the session client through `workspace-notebooks-data.ts`, revalidate Auth, filter owner/notebook/id and never update ownership/parent IDs; FK/RLS remains authoritative.
- Lazy Tiptap edits whitelisted structured JSON; derive previews from text, allow HTTP(S) links only and reject unknown documents without rewriting them.
- `NotebookAutosave` keeps page-scoped local drafts and serialized debounced writes; only latest confirmed versions update cache, failed saves retain content and block leaving until saved.
- Move a single page to its pin-group start/end; create/duplicate retries retain UUIDs and list counts/latest activity derive from existing page rows.
