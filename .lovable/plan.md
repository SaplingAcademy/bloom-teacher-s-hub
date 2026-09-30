# Correção estrutural dos modelos financeiros de pacotes

## Objetivo

Estabelecer uma única interpretação financeira para novos contratos, sem alterar contratos, faturas ou pagamentos existentes nesta etapa.

Modelos canônicos:

| Modelo | Significado do preço | Comportamento |
| --- | --- | --- |
| `monthly` | Valor de cada competência mensal | Cobranças mensais de valor integral; duração fixa ou contínua |
| `installment_total` | Valor total do contrato | Uma ou mais parcelas cuja soma é o valor total |
| `one_time` | Valor da cobrança única | Uma fatura integral |

`packages.duration` deixa de participar de qualquer cálculo financeiro. Ele continua representando somente a duração da aula em minutos.

## 1. Alterações somente em código

Antes e junto da adoção dos novos campos:

1. Criar um módulo de domínio financeiro compartilhado para:
   - normalizar valores legados (`Monthly`, `monthly`, `total`, `One-time`) nos três modelos canônicos;
   - construir um acordo financeiro a partir do pacote e das escolhas do professor;
   - calcular valor mensal, valor total previsto, quantidade de competências/parcelas e datas;
   - fornecer textos e progresso específicos por modelo;
   - impedir divisão do valor mensal pela duração contratual.
2. Remover de Students a atribuição `installment_count = packages.duration`.
3. Passar `default_installment_count` pelo hook e pelos formulários; usá-lo somente em `installment_total`.
4. Atualizar cadastro e edição de pacote:
   - mensalidade: duração `continuous` ou `fixed`; em `fixed`, informar meses;
   - valor total: mostrar parcelamento padrão;
   - pagamento único: não mostrar duração financeira nem parcelas;
   - manter duração da aula como campo independente.
5. Atualizar associação e renovação do aluno para criar o snapshot correto conforme o modelo.
6. Atualizar histórico, resumo, drawer, timeline e alertas para renderizar o significado do contrato, não apenas `installment_count`.
7. Atualizar o gerador de recebíveis para usar campos estruturados, vincular cada fatura ao contrato e deduplicar por contrato + competência/parcela.
8. Atualizar Financeiro, Growth Engine, métricas e Dashboard para consumir a mesma regra. Dashboard continuará baseado em pagamentos reais; não projetará receita como recebida.

Essas mudanças corrigem o comportamento, mas os snapshots imutáveis e a deduplicação confiável exigem a migration aditiva abaixo.

## 2. Migration aditiva recomendada — proposta, não executar

### `packages`

| Novo campo | Tipo sugerido | Função |
| --- | --- | --- |
| `billing_model` | `text` | Modelo canônico: `monthly`, `installment_total`, `one_time` |
| `billing_duration_type` | `text null` | Para mensalidade: `fixed` ou `continuous` |
| `contract_months` | `smallint null` | Meses somente quando mensalidade for `fixed` |

Restrições propostas:

- `billing_model` limitado aos três modelos canônicos;
- `billing_duration_type` limitado a `fixed`/`continuous`;
- `contract_months > 0` somente para mensalidade fixa;
- `default_installment_count > 0` somente para `installment_total`;
- manter `frequency` temporariamente para compatibilidade, mas parar de usá-lo como fonte primária para novos registros.

### `student_packages`

| Novo campo | Tipo sugerido | Função |
| --- | --- | --- |
| `billing_model` | `text null` | Snapshot imutável do modelo |
| `billing_duration_type` | `text null` | Snapshot `fixed`/`continuous` |
| `contract_months` | `smallint null` | Quantidade de competências da mensalidade fixa |
| `monthly_amount_cents` | `integer null` | Valor integral de cada mensalidade |
| `expected_total_cents` | `bigint null` | Projeção fechada: mensalidade × meses; total contratado; ou cobrança única |

Campos existentes passam a ter semântica estrita:

- `total_amount_cents`: usado como valor total contratado apenas em `installment_total` e `one_time`; para mensalidade nova, fica `null`.
- `installment_count` e `installment_amount_cents`: usados somente em `installment_total`; para mensalidade e pagamento único ficam `null` (se a coluna permitir) ou serão ignorados até uma migration posterior de constraints.
- `first_due_date`: primeira competência/parcela/cobrança.
- `last_due_date`: última competência da mensalidade fixa, última parcela ou vencimento único; `null` para mensalidade contínua.
- snapshots existentes de nome e preço continuam preservados.

### `invoices`

| Novo campo | Tipo sugerido | Função |
| --- | --- | --- |
| `charge_kind` | `text` | `monthly_charge`, `installment`, `one_time` |
| `sequence_number` | `smallint null` | Número da competência ou parcela; `1` no pagamento único |
| `sequence_count` | `smallint null` | Total fixo de competências/parcelas; `null` para mensalidade contínua |

Usar o campo já existente `student_package_id` em todas as novas faturas.

Índices únicos parciais propostos:

- mensalidade: `(teacher_id, student_package_id, billing_period)` para `charge_kind = 'monthly_charge'`;
- valor total: `(teacher_id, student_package_id, sequence_number)` para `charge_kind = 'installment'`;
- pagamento único: `(teacher_id, student_package_id)` para `charge_kind = 'one_time'`.

A descrição da fatura permanece apenas para exibição. Não participa da identidade, deduplicação ou regra financeira.

### Compatibilidade da migration

- Todos os novos campos em contratos e faturas existentes serão adicionados como `null`.
- A migration não terá `UPDATE`, backfill ou reclassificação automática.
- Nenhum registro existente será alterado.
- Novos contratos preencherão os campos canônicos; registros antigos seguirão pelo adaptador legado.

## 3. Forma de `student_packages` por modelo

### Mensalidade determinada — R$ 250 por 6 meses

```text
billing_model = monthly
billing_duration_type = fixed
contract_months = 6
monthly_amount_cents = 25000
expected_total_cents = 150000
total_amount_cents = null
installment_count = null
installment_amount_cents = null
first_due_date = 2026-10-06
last_due_date = 2027-03-06
```

Apresentação: `R$ 250,00 / mês`, `Período: 6 meses`, `0 de 6 mensalidades pagas`.

### Mensalidade contínua — R$ 250 até cancelamento

```text
billing_model = monthly
billing_duration_type = continuous
contract_months = null
monthly_amount_cents = 25000
expected_total_cents = null
total_amount_cents = null
installment_count = null
installment_amount_cents = null
first_due_date = primeiro vencimento
last_due_date = null
```

Apresentação: `R$ 250,00 / mês`, `Contínua — até cancelamento`; sem total de parcelas.

### Valor total — R$ 1.500 em 6 parcelas

```text
billing_model = installment_total
billing_duration_type = null
contract_months = null
monthly_amount_cents = null
expected_total_cents = 150000
total_amount_cents = 150000
installment_count = 6
installment_amount_cents = cronograma exato em centavos
first_due_date = primeiro vencimento
last_due_date = sexto vencimento
```

Apresentação: `R$ 1.500,00`, `6x de R$ 250,00`, `0/6 parcelas pagas`.

### Pagamento único — R$ 1.500

```text
billing_model = one_time
billing_duration_type = null
contract_months = null
monthly_amount_cents = null
expected_total_cents = 150000
total_amount_cents = 150000
installment_count = null
installment_amount_cents = null
first_due_date = vencimento
last_due_date = mesmo vencimento
```

Apresentação: `Pagamento único de R$ 1.500,00`.

## 4. Geração das invoices

### Mensalidade fixa

- Criar uma fatura por competência, sempre com `amount_cents = monthly_amount_cents`.
- Cada fatura recebe `student_package_id`, `charge_kind = monthly_charge`, período, sequência e total de competências.
- Pode ser gerada sob demanda por competência ou antecipadamente; a primeira implementação manterá a geração sob demanda, mas impedirá duplicidade pelo índice único.
- Encerrar após `contract_months`/`last_due_date`.

### Mensalidade contínua

- Criar uma fatura mensal integral enquanto o contrato estiver `active`.
- `sequence_count = null` e `last_due_date = null`.
- O índice por contrato + período impede repetição.

### Valor total

- Gerar o cronograma completo com soma exata igual a `total_amount_cents`.
- Cada fatura recebe número da parcela e vínculo ao contrato.
- Diferença de centavos fica na última parcela, como já faz `calculateInstallmentSchedule`.

### Pagamento único

- Gerar exatamente uma fatura no primeiro vencimento.
- O índice único por contrato impede nova cobrança.

## 5. Encerramento e renovação

### Mensalidade contínua

Encerrar/cancelar significa:

1. alterar o contrato de `active` para `cancelled` ou `completed`, conforme a ação;
2. gravar `ended_at` com a data efetiva;
3. impedir novas competências a partir do encerramento;
4. preservar faturas e pagamentos anteriores;
5. não cancelar automaticamente faturas já vencidas; faturas futuras ainda pendentes serão tratadas explicitamente pela ação de encerramento.

### Mensalidade determinada

- Ao alcançar a última competência, o contrato pode ser marcado como concluído.
- Renovar cria uma nova linha em `student_packages`, com novos snapshots e `renewed_from_id`.
- O contrato anterior permanece imutável.
- A renovação pode manter o pacote atual ou escolher outro; nunca reaproveita nem reinterpreta os valores do contrato anterior.

## 6. Arquivos e funções que serão alterados após aprovação

### Domínio e persistência

- novo módulo de domínio financeiro compartilhado;
- `src/lib/finance-engine.ts`:
  - criação de acordos;
  - sincronização e deduplicação de recebíveis;
  - resumos, histórico, timeline, alertas e renovação;
- `src/lib/growth-engine.ts`;
- `src/lib/growth-metrics.ts`;
- `src/lib/dashboard-metrics.ts`, apenas para garantir que continue baseado em pagamentos reais.

### Pacotes e contratos

- `src/components/bloom/PackageFormModal.tsx`;
- `src/components/bloom/PackageRenewalModal.tsx`;
- `src/hooks/use-packages-query.ts`;
- `src/routes/onboarding.tsx`;
- `src/routes/_app.finance.tsx`;
- `src/routes/_app.students.tsx`;
- `src/components/bloom/StudentFinancialDrawer.tsx`.

### Banco

- nova migration SQL aditiva, inicialmente criada como proposta revisável e não executada sem autorização explícita.

## 7. Compatibilidade com contratos existentes

Será usado um adaptador de leitura em duas camadas:

1. **Contrato novo:** se `student_packages.billing_model` estiver preenchido, ele é a única fonte da regra.
2. **Contrato legado:** se estiver `null`, normalizar `snapshot_frequency` quando disponível e, por último, `packages.frequency`; preservar exatamente os valores armazenados, sem regravá-los.

Proteções:

- não inferir nem corrigir silenciosamente contratos antigos;
- não preencher snapshots legados durante leitura;
- não alterar faturas antigas;
- marcar internamente contratos legados/ambíguos para a auditoria futura;
- alteração posterior no catálogo não afetará contratos novos;
- auditoria e eventual correção retroativa serão uma etapa separada, com relatório antes de qualquer `UPDATE`.

## 8. Ordem de implementação após aprovação

1. Criar a migration proposta no repositório, sem executá-la, para revisão final.
2. Criar o domínio financeiro canônico e testes unitários para os três modelos.
3. Adaptar pacote/onboarding e associação do aluno.
4. Adaptar geração de invoices com vínculo e chaves estruturadas.
5. Adaptar histórico, timeline, alertas, drawer e renovação.
6. Adaptar Growth Engine e métricas; validar Dashboard com pagamentos reais.
7. Validar novos contratos em cenários de mensalidade fixa, contínua, total irregular em centavos e pagamento único.
8. Somente após autorização explícita: executar a migration e habilitar a gravação dos novos campos.

## Fora desta etapa

- Nenhuma alteração ou correção de contratos existentes.
- Nenhum backfill.
- Nenhum `UPDATE` em dados financeiros.
- Nenhuma execução automática da migration.
