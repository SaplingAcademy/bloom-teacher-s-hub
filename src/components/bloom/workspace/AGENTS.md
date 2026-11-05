# Personal notes
- Use only workspace_notes with the existing session client and RLS; freshly validate Auth identity and owner-filter writes so drafts never supply user_id.
- Order notes pinned-first and move a single row to either group end through order_index; this avoids partial multi-write failures without schema changes.
- Serialize optimistic mutations per owner-scoped Query cache, cancel stale reads and roll back failures; retain the create editor UUID across retries to avoid duplicate notes.
- Render note content as React text only, never HTML, and reuse semantic note tokens and PT/EN dictionaries so stored colors and content remain unchanged.