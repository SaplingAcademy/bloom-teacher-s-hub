# Roadmap

- [ ] Support 1–7 weekly class/group schedules in create/edit and preserve schedule IDs; verify Calendar projection for 1, 2, 3 slots.
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
