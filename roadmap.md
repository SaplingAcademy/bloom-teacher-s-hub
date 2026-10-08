# Roadmap

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
- [ ] Auditar e migrar todos os textos visíveis restantes para o i18n português/inglês
- [ ] Traduzir apenas labels de enums, preservando os valores canônicos armazenados
- [ ] Validar a interface, o typecheck e os testes existentes após a padronização
