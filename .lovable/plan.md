# Conectar aulas programadas às Prioridades do Dia

## Objetivo
Gerar pendências de presença diretamente das aulas criadas pelos Lesson Plans, sem criar tarefas duplicadas e sem alterar regras do calendário ou dos planos.

## Implementação
- Consultar `lesson_plans` vinculados a `calendar_events` do professor e considerar a data **e o horário final** da aula.
- Resolver presença pela fonte canônica `attendance_records`; considerar cancelamentos/encerramentos válidos pelo status já existente em `calendar_events`.
- Para aula individual, criar uma pendência por aluno; para turma, avaliar cada aluno ativo e criar somente os registros ainda sem presença.
- Manter até cinco dias em **Prioridades de Hoje** e mover pendências com mais de cinco dias para **Urgente**, reutilizando os cartões atuais.
- Exibir nome e data no idioma atual e abrir a aula correta para registrar presença quando houver destino suportado.
- Remover a pendência da resposta assim que presença, ausência, atraso, justificativa ou cancelamento estiver registrado.

## Detalhes técnicos
- Centralizar a classificação temporal em funções puras e testáveis, evitando diferenças de fuso e impedindo aulas futuras ou ainda em andamento.
- Estender apenas os modelos existentes de prioridade/urgência; não criar tabela, migration ou tarefa persistida.
- Preservar o filtro por `teacher_id` e os status canônicos já adotados pelo produto.

## Validação
- Testar aula futura, aula de hoje após o horário, 3 dias, 6 dias, presença registrada, ausência e cancelamento.
- Executar os testes focados e `npx tsc --noEmit`; confirmar o build da prévia.
