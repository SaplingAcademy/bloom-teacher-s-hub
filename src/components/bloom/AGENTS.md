# Pedagogical settings editor

- Keep teaching-options drafts in pure `src/lib/catalog-editor.ts` operations; IDs are generated once and never edited or derived from labels, so renames preserve identity.
- Persist through `src/lib/catalog-settings.ts` using the session client, freshly verified teacher identity and an owner-scoped update of only `settings.catalog_options`; return persisted values to the existing teacher-scoped catalog cache to preserve unrelated settings and account isolation.
- Missing settings rows and failed/invalid reads or writes fail visibly rather than creating partial rows or substituting local defaults; this editor does not provision teacher settings or alter historical records.