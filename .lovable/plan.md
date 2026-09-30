# Corrigir o fluxo de vencimentos

## Objetivo
Tornar `student_packages.due_day` e `first_due_date` a fonte canônica para novos contratos e suas cobranças, sem alterar dados históricos nem executar migrações.

## Implementação
- Centralizar a criação das datas mensais, preservando o dia escolhido e ajustando 29–31 apenas em meses mais curtos.
- Bloquear novos salvamentos e renovações sem vencimento obrigatório, removendo padrões silenciosos de dia 5 ou 18.
- Ao editar um aluno, carregar e preservar vencimento, primeiro vencimento, forma de pagamento e termos financeiros do contrato ativo.
- Vincular toda nova invoice ao respectivo `student_package_id`, inclusive cobranças individuais de alunos em turma; o vencimento do contrato individual terá prioridade.
- Calcular o próximo vencimento somente a partir do contrato ativo e de suas invoices. Para invoices legadas sem vínculo, aceitar apenas as que estiverem dentro da vigência desse contrato, sem atualizar registros antigos.
- Formatar datas exibidas conforme o idioma, mantendo o valor armazenado em `YYYY-MM-DD`.

## Validação
- Cobrir dia 10, preservação na edição, isolamento entre contrato antigo e novo, ajuste de dia 31 e os três modelos de cobrança.
- Executar os testes financeiros e `npx tsc --noEmit`.
- Confirmar que nenhuma migration ou alteração retroativa de dados foi executada.
