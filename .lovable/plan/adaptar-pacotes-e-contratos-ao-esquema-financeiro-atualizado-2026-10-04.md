# Adaptar pacotes e contratos ao esquema financeiro atualizado

## Objetivo
Usar os novos campos já disponíveis no banco para todos os novos pacotes e contratos, sem migration, backfill ou alteração automática de registros históricos.

## Implementação
1. Atualizar o domínio financeiro para exigir escolhas explícitas em novos registros: duração da aula, duração mensal fixa e quantidade de parcelas, sem defaults comerciais silenciosos.
2. Atualizar leitura, criação e edição de pacotes para `lesson_duration_minutes`, `billing_model`, `billing_duration_type` e `contract_duration_months`; manter fallback somente de leitura para pacotes legados com campos novos nulos.
3. Atualizar associação e renovação de alunos para gravar snapshots em `student_packages` usando `billing_model`, `billing_duration_type`, `contract_duration_months`, `monthly_amount_cents` e `snapshot_frequency`, mantendo `installment_count` apenas para `installment_total`.
4. Remover dos caminhos de novos registros qualquer uso de `packages.duration` como duração contratual ou parcelamento e qualquer fallback de 6 meses, 12 parcelas ou 60 minutos.
5. Atualizar testes do domínio e executar `npx tsc --noEmit`.

## Compatibilidade
- Registros legados continuam sendo lidos pelos campos antigos quando os novos estiverem nulos.
- Nenhum registro histórico será regravado ou reinterpretado automaticamente.
- Nenhuma migration será criada ou executada.
