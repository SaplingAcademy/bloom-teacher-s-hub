# Roadmap

- [x] Notebook formatting: reproduced Tiptap's whole-containing-list conversion; notebook-only shared toggleList override splits selected items and preserves neighboring wrappers, checked/nested content, numbering, cursor, toolbar and native shortcuts. Toolbar mouse press preserves selection; autosave/SQL/Mural/Projects unchanged.
- [x] Notebook formatting: 48 focused formatting/autosave/JSON/data tests passed (18 new regressions); actual components verified toolbar/shortcuts, isolated saved JSON and page switching in EN 1280px/800px and PT 390px with no runtime errors or horizontal overflow. Automatic compilation OK; installed happy-dom/vitest for reproducible editor tests.
- [ ] Notebook formatting: real authenticated autosave/reload read-back remains unverified because /workspace/notebooks redirects to /auth and no external teacher session is available. Isolated adapter/editor recreation verifies JSON preservation, not production persistence/RLS.

- [x] Leads: inspected existing funnel and stage-change entry points; canonical stages are Novo contato, Em conversa, Aula experimental agendada, Proposta enviada, Convertido, Perdido. No manual stage selector/drag or Nivelamento concluído exists; actions advance through existing interaction/trial/proposal/conversion flows.
- [x] Leads: individual prior-step confirmation before trial/proposal/conversion submissions, existing funnel only; no inferred history, real empty-initialized dates, side-effect-free Cancel before final confirmation and No leaves missing step unrecorded. Confirmed contact uses existing triggers; trial/proposal facts use stable event/history IDs without tasks/calendar/Rule B. Existing action automations unchanged.
- [x] Leads: 55 focused rule/persistence/history/conversion/automation tests passed; isolated actual dialog/hook checks passed cancellation with zero writes, real-date validation, per-step No/Yes, network retry without duplicates and PT/EN desktop/mobile. Automatic compilation OK. Confirmed-event read fallback preserves history if separate activity write fails.
- [ ] Leads: real authenticated end-to-end trial/proposal/conversion + confirmation readback/RLS check remains blocked by unavailable external session; isolated persistence does not verify live database triggers or rows.

- [x] Workspace Entrega 5: personal notebook/page CRUD on existing tables, lazy Tiptap rich-text JSON editor, pinned ordering and PT/EN desktop/mobile UI; no SQL, quotas, collaboration or Mural/Projects changes.
- [x] Workspace Entrega 5: 700ms serialized autosave, page-scoped preserved drafts, latest confirmed/error status, retry, metadata-write editing lock and save-before-navigation protection. All 65 focused notebook/Mural/Projects tests passed; automatic compilation OK.
- [x] Workspace Entrega 5: isolated actual components verified notebook create/edit/delete, pages rename/duplicate/pin/reorder/delete, formatting/checklist/safe links, debounce/rapid switching, network error/retry, blocked failed navigation and saved reopen in PT/EN at 1280px/800px/390px without runtime errors. Mock persistence does not establish production RLS or real saves.
- [ ] Workspace Entrega 5: verify authenticated notebook/page persistence and RLS with real teacher accounts; blocked by unavailable external session (live /workspace/notebooks redirects to /auth).

- [x] Today performance: production telemetry confirmed priority reads began about two seconds after inactivity automation; the controlled real-component baseline took 2,414 ms and duplicated the read. No business-rule, database or Workspace changes.
- [x] Today performance: priorities now start concurrently with automation in a teacher/local-day React Query cache, deduplicate mounts, retain cached content during revalidation and invalidate after newly created automation tasks. Controlled result 416 ms (-1,998 ms / -82.8%); 470 Vitest + 159 Bun tests, typecheck and preview build passed.
- [ ] Today performance: repeat the after timing with a real authenticated teacher and production data; blocked by unavailable authenticated sandbox session. The before timing was observed in production telemetry, while the equivalent before/after comparison used controlled 2,000 ms automation and 300 ms priority delays.

- [x] Workspace Entrega 3: personal notes in existing workspace_notes, PT/EN compact editor, seven colors, confirmation, pinning and single-row accessible persisted ordering; optimistic rollback, serialized writes, stable create UUID and Auth-derived ownership. No SQL, Projects/Notebooks changes or Entrega 4.
- [ ] Workspace Entrega 3: verify saved note operations with real authenticated teachers and production RLS; blocked by unavailable external session (live /workspace/mural redirects to /auth). Focused tests and isolated real-component desktop/tablet/mobile flows verify behavior but not real database persistence.
- [x] Workspace Entrega 4: personal projects, phases, tasks/checklists, notes and links with derived progress. Real-account check pending (no signed-in session available).

- [x] Academy: add PT/EN Coming Soon navigation/page for Free and Pro; private construction page for server-verified super_admin only, keeping publication separate from entitlement. No courses, uploads, tables or SQL execution; existing user_roles/has_role are reused without changing can_access_academy's plan entitlement.
- [x] Verify Academy rules/server authorization and existing plan compatibility: 32 focused tests passed. Direct signed-out /academy on desktop/mobile reaches /auth without runtime errors; direct unauthenticated calls are blocked. Automatic preview compilation OK. No new SQL required because no Academy content tables, storage or write operations exist.
- [x] Academy Stage 2C.1: internal home for super_admin only (header, search, featured/continue empty states, five official categories as filters, courses/videos sections, disabled future "Gerenciar conteúdos"). No fake content, player, progress, tables or SQL; Coming Soon unchanged for Free/Pro.
- [x] Academy Stage 2C.2: content management (courses/modules/lessons/standalone videos CRUD, reorder, duplicate-as-draft, publish/unpublish with confirmation, YouTube ID normalization, cover upload to academy-covers). Home shows published content only. Manual SQL docs/migrations/20261105070000_academy_content_manual.sql PENDING application — without it management reads fail.
- [ ] Verify the signed-in Free/Pro Coming Soon page, super_admin construction page and PT/EN sidebar with real accounts; blocked by unavailable external authenticated session. Unit authorization cases do not establish production has_role configuration or authenticated UI behavior.

- [x] Stage 2A: retain all 23 original templates verbatim with stable metadata IDs; move content server-only and add actual authenticated database assertions at preview/use/duplicate/generate/copy. Copies retain original classification; complete paginated reads and 30-second/focus refresh never substitute unknown permissions for Free.
- [x] Add only super_admin Library administration with search/category/current classification and confirmed RPC saved read-back. Prepare docs/migrations/20261105060000_library_access_manual.sql: one classification table, 23 literal Free seed rows, authorized access/admin RPCs, no unrelated RLS changes or SQL execution.
- [x] Run only library-access, library-content and plans tests: all 33 passed; original content preservation verified; automatic preview compilation OK. Real desktop/mobile /resources and /admin redirect to /auth without runtime errors, not an authenticated flow verification.
- [ ] Apply the manual Library SQL before publishing these changes; without its table/RPCs resource access deliberately remains denied, including Free resources. Blocker: production SQL requires manual application under project conventions.
- [ ] Verify real Free/Pro/super_admin access, admin confirmation/save/read-back and PT/EN Library layout after SQL application; no authenticated external teacher/admin session is available. Tests use isolated authorization responses, not production RLS verification.

- [x] Correct only Lead conversion pedagogical prefill/selectors and NULL payloads using the shared teacher catalog; preserve personal/commercial values and historical options. Skip schedule recreation on the existing RPC already-converted response.
- [x] Restore original-lead history reads through teacher/source-scoped lead.converted events for old student-targeted activities; deduplicate activity IDs without writes/backfill. Provide narrowly guarded manual SQL that patches only the installed function's activity target; no SQL or migrations executed.
- [x] Run only tests/lead-conversion.test.ts, tests/lead-conversion-history.test.ts and tests/lead-interactions.test.ts: 23 passed; no manual build or broad checks.
- [ ] Verify conversion through authenticated UI and installed RPC behavior; external teacher session/direct database access unavailable. Optional canonical history-target SQL awaits manual application; frontend history works with existing linked conversion events meanwhile.

- [x] Correct Rule E contact-based inactivity and shared persisted threshold in Today/attention; exclude closed leads and ignore notes/profile edits. Queue data readers remain read-only; PT/EN contact descriptions updated.
- [x] Connect Rule E to existing queue load/refresh callbacks, dedupe concurrent loads and throttle one minute; persist first-observed activation per settings revision and contact-cycle event claims in existing tables. Create linked follow_up tasks and lead-targeted history; retain manual/completed tasks, retry missing writes only, exclude activation backlog. Rules A/C/D and layout unchanged; no SQL/migrations/manual build/audit.
- [x] Run only tests/lead-inactivity.test.ts + tests/inactive-lead-automation.test.ts (34 Vitest cases) and the modified tests/today-priorities-integration.test.ts (4 Bun cases): all 38 passed. Browser opens /auth with no runtime errors; automatic preview compilation OK.
- [ ] Verify Rule E saved tasks/history through authenticated UI; blocked by unavailable external teacher session. Frontend checks run only on queue load/refresh, not with the app closed; guaranteed scheduled execution requires separate infrastructure. Abrupt tab closure or failure to persist failed status can leave a cycle processing; it is not stolen because safe cross-tab interrupted-claim recovery needs atomic database task uniqueness/transaction enforcement, outside this no-schema scope.

- [x] Add confirmed trash removal after reorder arrows in all three teaching-options groups, immediate persistence, active-only main lists and separate ID-preserving recovery; require saving unfinished edits before removal/recovery.
- [x] Check paginated, teacher-scoped historical level/focus/modality references (students, leads, calendar events, classes, lessons/resources where applicable), including aliases/legacy labels and inactive/archived records. Permanently remove only after successful unused checks; retain used IDs/metadata with active=false. Single-column compare-and-set preserves other settings and rejects conflicting catalogs/account switches; no tables, migrations, history writes or other screens changed.
- [x] Run only the five focused catalog test files: 86 passed. Isolated real Settings editor/hook/mutations verified confirmation/cancel, unused deletion, used archive, cache refresh, reload, same-ID recovery and failed-write retention; PT/EN dialogs and 800px/390px fit passed without runtime errors. Automatic preview build OK; no manual build/typecheck or broad tests.
- [ ] Verify removal/recovery with real authenticated teacher records; unavailable external app session means /settings redirects to /auth. Isolated mocked session/data reads do not verify production RLS/schema or actual database readback. Client history checks are not atomic with concurrent record creation; strict race-proof enforcement would require separately authorized database work.

- [x] Add only the Teaching options section to existing Settings with stable-ID editing, ordering, activation and modality nature in PT/EN; preserve languages, other screens and historical data.
- [x] Save the complete normalized catalog only to the freshly verified authenticated teacher's existing settings row, updating only catalog_options and the exported teacher-scoped cache; missing rows fail explicitly without partial settings creation.
- [x] Run only catalog-options, catalog-editor and catalog-settings focused tests: 53 passed. Isolated real-editor checks passed additions/renames/order/activity/nature, blocked blank names, failed-save draft retention and PT/EN mobile fit, with no runtime errors. No manual build, typecheck, migrations, audit or broad suite; automatic preview build OK.
- [ ] Verify Teaching options save/reopen with real authenticated teacher settings; blocked by unavailable external app session (live /settings redirects to /auth). Isolated editor save callback and mocked session-client persistence tests do not establish live RLS or actual database readback.

- [x] Create only reusable pedagogical catalog helper and authenticated teacher-scoped read hook; preserve IDs, inactive/legacy/unknown values and empty selections. No screens, migrations, data writes or unrelated settings changes.
- [x] Run only tests/catalog-options.test.ts with Vitest: 33 passing cases covering defaults, NULL, validation/order, rename/deactivation, historical aliases, literal unknowns and active-ID selections. No manual build/typecheck/audit/broad suite; hook live read is not exercised because no screen consumes it in this infrastructure-only stage.

- [x] Move Today lessons into an immediate card-anchored popover consuming existing metrics.todayEvents, with unchanged count/other cards/priorities, Calendar eventId navigation and removal of only the lower agenda block. Six existing daily-metric tests passed with Vitest; isolated real-component PT/EN checks passed for chronology, anchor/no layout or scroll shift, Enter/Space/Tab, Escape/outside dismissal, zero/loading/error states, footer and 754×543/390×844/320×568 viewport fit. No new query, data changes, manual build or broad suite.
- [ ] Verify Today popover → specific occurrence details with real authenticated lessons; blocked by unavailable authenticated session (live / redirects to /auth). Isolated checks passed occurrence IDs through callbacks only, not a saved Calendar readback.

- [x] Correct only the Students welcome description in PT/EN without asserting packages exist; preserve title and presentation.
- [x] Inspect the first-student CTA and save path with zero packages: advisory prompt retains Continue without a package, package ID starts empty and saves as null, due-date validation/agreement writes require a selected package, and new-student success updates the list. No package-related blocker found; only PT/EN welcome copy changed, with no data creation, workflow changes, manual build or broad checks.
- [ ] Confirm first-student registration end-to-end for a real newly onboarded teacher with zero students/packages; blocked by unavailable authenticated session (live /students redirects to /auth). No account, student or package was created for testing.

- [x] Add shared onboarding blocked-validation feedback: reveal/focus the first existing required-field error and its question below the sticky header, retain inline messages, and show compact PT/EN feedback on every blocked attempt. All existing blocking name gates share the reporter; optional warnings and saving remain unchanged. 15 focused tests and isolated PT/EN real-page checks passed at 754×543, including repeat attempts, summary return and skip form; no manual build or broad checks.
- [ ] Verify onboarding feedback with a real signed-in teacher; blocked by unavailable authenticated session (live /onboarding redirects to /auth). Isolated real-page checks passed with synthetic draft data and no persistence writes.

- [x] Translate only Calendar lesson details in PT/EN and expose existing event-scoped class attendance with active members, canonical statuses and cancelled-lesson safeguards; 8 focused persistence/guard tests and isolated full-panel PT/EN/individual/class/mobile checks passed. Reopening class Lesson Plan rereads the same attendance. No database changes, manual build or broad checks.
- [ ] Verify Calendar ↔ Lesson Plan attendance against real teacher data; blocked by unavailable authenticated access (Calendar redirects to /auth). Isolated UI checks and shared-helper readback tests passed; no real attendance records were changed.

- [x] Correct only Growth Revenue Potential card: current MRR plus actual bookable capacity at canonical occupied-hour efficiency, using 4.33 weeks/month. Retained forest styling, added PT/EN neutral/no-free-slot states and explicit next-seven-day capacity period, removed only the card's goal summary; 12 focused formula/guard/class/exception tests and isolated desktop/mobile card checks passed. No database, shared engines, goals or other module changes; no manual builds or broad checks.

- [x] Update only Growth Revenue Potential card: forest styling, existing projected revenue and saved goal, remaining/achieved state, capped progress and existing no-goal flow; PT/EN. Four targeted metric tests and isolated desktop/mobile card checks passed; formulas, opportunities and database unchanged. No manual build or broad checks.
- [ ] Verify corrected Growth revenue potential against saved teacher data; blocked by unavailable authenticated account access (Growth redirects to /auth). Potential, full-capacity, missing-data and failed-read states were verified in isolation only.

- [x] Replace Finance ledger student search with an editable student combobox using useStudentsQuery and invoice student IDs; includes inactive students, preserves status/period filters, and supports clearing and keyboard navigation. All 11 focused cashflow tests and isolated PT/EN desktop/mobile checks passed; preview build OK, no financial writes changed.
- [ ] Verify the student combobox against saved teacher data in Finance; blocked by unavailable authenticated session (/finance redirects to /auth). Isolated checks use the real component and filter with synthetic rows, not production data.

- [x] Align Today current/previous revenue and trend with Finance through calculateReceivedCentsForMonth and shared invoiceReceiptFields; teacher-scoped paid-invoice read runs inside the existing dashboard cache without synchronization writes. 29 focused tests passed, including Finance mapping equivalence; 15 revenue tests also passed in America/Sao_Paulo; preview build OK. Records and other metrics unchanged.
- [ ] Verify matching Today/Finance amounts against saved teacher data; blocked by no available authenticated session (both / and /finance redirect to /auth; browser showed no runtime errors).

- [x] Fix confirmed Today priority integration bugs only: existing teacher-task fields, independently loaded proposal/stale Leads without guessed trial associations, nested PT/EN reasons and six persistent chips with truthful zero/error states. Six focused tests and six isolated browser checks passed; build OK; attendance, database and other workflows unchanged.
- [ ] Verify corrected priorities against saved teacher data; blocked by unavailable authenticated session.

- [x] Replace Finance's long period dropdown with reusable year/month popover, year-scoped full-year option and retained current/open view; financial calculations and other Finance UI unchanged. Six focused tests and isolated PT/EN picker interactions passed; preview build OK.
- [ ] Verify period filtering against saved teacher data in Finance; blocked by unavailable authenticated session (/finance redirects to /auth). The real picker was checked in isolation, including year arrows, monthly/full-year selection, dismissal and narrow-screen fit.

- [x] Refine Today: moved the existing summary row above daily priorities, removed the invalid legacy group_id projection from the canonical Calendar read, scoped individual/class non-cancelled lessons to the local date in start-time order, enabled remount refresh with stable invalidation, and styled only the monthly revenue card using forest tokens. All 7 targeted checks passed; preview build OK; no database or financial calculation changes.
- [ ] Verify Today cards and agenda with saved teacher data; blocked by unavailable authenticated session (opening / redirects to /auth).

- [x] Unify empty Calendar slot and header entry through the existing Aula / Evento selector; preserve clicked date/time for either form, clear slot context from the header and retain existing event-detail guards. Reconfirmed existing week/day/month handlers on 2026-10-19; all 14 focused context/custom-event tests passed without scheduling code changes.
- [ ] Verify unified grid scheduling in the signed-in Calendar; blocked by the unavailable teacher session (Calendar redirects to /auth).

- [x] Refine manual lesson scheduling: searchable multi-student selection without classes, start/end validation, compact tags and event-linked plans; 9 targeted checks passed and preview build OK. Prepared minimal lesson_tags column SQL without applying it.
- [x] Enable lesson-tag persistence in production; user confirmed successful manual application of the lesson_tags SQL on 2026-10-19.
- [ ] Verify manual multi-student scheduling in the signed-in Calendar; browser check redirects to /auth, no available authenticated teacher session.

- [x] Unify Calendar header scheduling into a lightweight lesson/event choice, reuse both existing forms and preserve direct empty-slot creation; targeted entry-point checks passed and preview build OK. Signed-in UI verification remains unavailable (Calendar redirects to /auth).

- [x] Refine custom Calendar events with empty-slot click-to-create and teacher-entered categories; 13 focused default/category/drag checks passed and preview build OK. Signed-in interaction verification remains blocked by unavailable teacher session.

- [x] Add one-time custom Calendar events, isolated create/edit/delete/drag, and focused occupancy checks; 34 tests passed, preview build OK.
- [x] Prepare exact safe migration SQL in docs/migrations for manual production application; user confirmed successful production application and verification on 2026-10-19.
- [x] Confirm existing custom Calendar integration needs no changes for the live schema; all 8 targeted custom-event checks passed.
- [ ] Verify custom events against saved teacher data; schema blocker resolved, authenticated end-to-end verification still requires an available teacher session.

- [x] Show Growth weekday capacity as clickable chips and a compact available-times section, using one shared capacity result; focused availability checks passed.
- [ ] Verify Growth times with an authenticated teacher; blocked because the app redirects to /auth and no managed session is available.

- [x] Implement safe class deletion/archive, retain student history and offer individual next steps; focused lifecycle and schedule tests passed, no schema changes.
- [ ] Verify class archival/deletion with a real authenticated class; blocked by external app authentication (live preview redirects to /auth, no managed session available).

- [x] Support 1–7 weekly class/group schedules in create/edit and preserve schedule IDs; 6 targeted persistence/projection checks plus isolated UI checks for 1, 2, 3 slots passed.
- [ ] Verify class creation/editing against saved teacher data; blocked by no available authenticated session (preview opens /auth).
- [x] Link Calendar and Lesson Plan homework status through lesson_plans.homework_posted by event_id; 8 targeted tests and isolated two-way/readback/error checks passed, no schema changes.
- [ ] Verify homework status with a real authenticated lesson; blocked by no available authenticated session (preview opens /auth).

- [x] Replace scheduling rejections with shared manual/drag confirmations; 17 occurrence tests and isolated warning UI checks passed without RPC changes.
- [ ] Verify confirmed rescheduling end-to-end with a real authenticated lesson; blocked by the absence of an available session and deployed RPC definition.

- [x] Add week-only drag rescheduling through the existing occurrence function; 20 targeted tests and isolated pointer checks passed. Real authenticated lesson move remains unverified without a session.

- [x] Add canonical financial domain rules and additive migration proposal (do not execute)
- [x] Update package creation/editing/onboarding for monthly fixed or continuous duration
- [x] Update student assignment and renewal snapshots for all three billing models
- [x] Generate structured, contract-linked invoices with legacy compatibility until schema approval
- [x] Update student finance history, timeline, alerts, Growth and Dashboard interpretations
- [x] Validate types, tests, current build, and confirm no existing data was changed
- [x] Centralize due-date calculations and require canonical agreement dates
- [x] Preserve active agreement terms when editing students
- [x] Link new invoices and isolate active-contract financial summaries
- [x] Validate due-date scenarios and TypeScript
- [x] Derive attendance priorities from lesson-plan events and canonical attendance records
- [x] Escalate unresolved attendance after five days and deep-link to the exact lesson
- [x] Validate future, current, overdue, resolved, absent, and cancelled scenarios
- [x] Adopt the manually added package and agreement billing fields for new records without changing history

- [x] Livro Caixa: sincroniza sempre ao abrir, um contrato canônico por aluno, inserção idempotente (23505), erros reais e contratos com problema exibidos na tela.
- [x] Gestão de cobranças: aba Cobranças, pagar/editar/desfazer, vencimento individual, pagamentos anteriores no cadastro
- [x] Correção do cronograma de contrato existente: UPDATE do contrato e das cobranças, sem novo contrato; started_at só com Data de Início alterada
- [x] Lesson Plan reutiliza Data de Início/Término do aluno (course_start_date/course_end_date)
- [x] Auditar e migrar todos os textos visíveis restantes para o i18n português/inglês
- [x] Traduzir apenas labels de enums, preservando os valores canônicos armazenados
- [x] Validar a interface, o typecheck e os testes existentes após a padronização

- [x] Replace decorative Sparkles/star icons with contextual Lucide outline icons; validate only these visual changes.
- [x] Financeiro: marcar como pago abre dialog de confirmação com data (padrão hoje) e meio de pagamento via recordInvoicePayment; cobranças pagas ganham "Editar pagamento" (updateInvoicePaymentDate); markInvoiceAsPaid removido da página
- [x] Today priorities Phase 2: DailyPrioritiesCard now reads the unified daily-priorities module with compact category filter chips (local filtering, live counts), urgency-grouped sections in "Todas", localized reason lines, per-category failure notice, truthful "{count} prioridades" summary, and a positive empty state. priority-engine.ts is now unused (kept, pending removal with UrgentWidget in Phase 3). 24 targeted tests pass; typecheck and build OK.
- [x] Etapa 3 personalização pedagógica: formulário de alunos usa useCatalogOptions (nível/foco/modalidade) e useTeacherLanguages (idioma); IDs estáveis salvos, sem auto-seleção, campos vazios permitidos, valores históricos preservados; corrigida associação focus↔language_studied; students.modality gravado; filtros e exibição resolvem labels do catálogo; testes focados (42) passam.
- [ ] Apply manual SQL docs/migrations/20261105040000_roles_plans_manual.sql (roles, plans, free-plan trigger) — pending user authorization
- [ ] Promote the two designated accounts to super_admin via section 7 of that SQL (UUIDs needed)
- [x] Painel Administrativo v1: /admin (super_admin) lista professores reais com plano, alunos ativos e cadastro; busca, filtro por plano, indicadores e troca de plano com confirmação; rebaixamento bloqueado acima de 5 ativos; menu Administração só para super_admin; 9 testes focados passam.
- [ ] Apply manual SQL docs/migrations/20261105050000_admin_panel_manual.sql (list_admin_teachers + set_teacher_plan RPCs) — pending user authorization
