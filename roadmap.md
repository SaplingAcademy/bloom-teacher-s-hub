# Roadmap

- [ ] Correct only Growth Revenue Potential card to estimate current MRR plus actual free-capacity potential at existing occupied-hour efficiency (4.33 weeks/month); retain forest styling, add PT/EN neutral/full-capacity states, remove only this card's goal summary, and run focused checks only.

- [x] Update only Growth Revenue Potential card: forest styling, existing projected revenue and saved goal, remaining/achieved state, capped progress and existing no-goal flow; PT/EN. Four targeted metric tests and isolated desktop/mobile card checks passed; formulas, opportunities and database unchanged. No manual build or broad checks.
- [ ] Verify updated Growth revenue card against saved teacher data; blocked by unavailable authenticated account access (Growth redirects to /auth). Card states were verified in isolation only.

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
