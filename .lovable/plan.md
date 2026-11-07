# Lesson Plans — validação de quantidade antes da geração

## Diagnóstico do fluxo atual

### Causa principal confirmada
No planejamento individual, o Bloom calcula a sequência solicitada e depois remove as aulas posteriores à data de término. O formulário só interrompe quando restam **zero** aulas. Se forem solicitadas 20 e restarem 17, as 17 seguem para salvamento e a interface informa sucesso.

A previsão de término usa a sequência **antes** desse corte. Por isso, a revisão e o resultado salvo podem representar períodos diferentes.

### Onde as datas são calculadas
- **Individual:** `generateLessonPlanOccurrences`, em `src/lib/lesson-plan-sync.ts`, percorre os dias e os horários semanais, pulando períodos sem aula.
- **Turmas/duplas:** `generateOccurrences`, em `src/lib/lesson-plans.ts`, faz cálculo semelhante. O formulário de turma atualmente tem apenas data inicial e término previsto, sem data final selecionável.
- Ambos param ao atingir a quantidade pedida ou o limite de 730 dias. Se o limite for atingido primeiro, podem retornar uma quantidade menor sem sinalizar insuficiência.

### Quais restrições realmente existem
Feriados, férias, recessos e folgas bloqueiam datas quando estão registrados em `teacher_time_off`, com início e fim inclusivos. Não há consulta automática a um calendário externo de feriados nesses geradores.

Horário habitual, pausas recorrentes e conflitos semanais são avisos no planejamento de turmas, não bloqueios. O gerador individual não usa essas verificações para excluir datas. A correção manterá essas diferenças: **não transformará avisos em novas proibições**, nem acrescentará regras de conflito de outros módulos.

### Onde os registros são salvos e os riscos encontrados
- **Individual:** formulário → `saveStudentLessons` → criação/reutilização de `calendar_events` → `saveLessonPlans` → `lesson_plans` por `event_id`.
- **Turmas:** formulário → `generateClassLessonPlan` → `insertClassEvents` → associação das ocorrências → `saveLessonPlans`.
- No individual, há gravação em cache local antes da confirmação remota. Falhas de criação de eventos podem deixar aulas sem vínculo, e o formulário pode anunciar sucesso mesmo com `success: false`.
- Nas turmas, eventos e planos são gravados em etapas separadas. A confirmação final atual verifica que existe algum plano, não que todas as ocorrências desta tentativa tenham plano.
- Já existe reutilização de eventos por data/horário, incluindo a posição original de aulas remarcadas, e upsert por `event_id`. Porém, leituras que falham não devem ser tratadas como ausência de registros em uma tentativa de geração.
- No individual, as folgas carregadas ao abrir o formulário podem ficar desatualizadas. Nas turmas, a geração relê folgas, mas soma uma cópia antiga recebida do formulário; uma folga excluída pode continuar bloqueando indevidamente.

## Solução proposta

### 1. Uma lista exata para validar e gerar
- Reutilizar a lógica de elegibilidade de cada gerador, sem estimativa por semanas ou uma segunda fórmula de calendário.
- Com data final preenchida, percorrer o período completo, incluindo os dois extremos, e obter todas as ocorrências elegíveis. A quantidade possível será o total real dessa lista; a geração usará somente as primeiras ocorrências necessárias.
- Preservar horários, duração, identificação dos horários recorrentes, ordem cronológica e exclusões atuais. Blocos distintos no mesmo dia contam como aulas distintas; um mesmo bloco repetido não pode produzir uma contagem fictícia.
- Sem data final, preservar o fluxo atual de busca pela quantidade solicitada e seu limite de segurança, mas bloquear se a busca terminar sem alcançar a quantidade. Não tornar uma data hoje opcional obrigatória silenciosamente.
- Fazer revisão, validação e geração consumirem o mesmo resultado, sem cortar a lista depois da aprovação.
- Nas turmas, adicionar data final opcional apenas ao formulário de geração, sem criar campos no banco ou mudar o cadastro da turma.

### 2. Bloqueio antes de qualquer escrita
- Centralizar a tentativa de geração individual em uma operação própria que recebe os campos preenchidos, relê as folgas persistidas e calcula a lista validada antes de chamar qualquer salvamento ou cache.
- Aplicar a mesma proteção dentro de `generateClassLessonPlan`, antes de inserir eventos ou atualizar vínculos.
- Retornar uma insuficiência identificável com quantidade solicitada, possível e faltante. Exemplo: 20 solicitadas, 17 possíveis, 3 faltantes — sempre calculadas, nunca fixadas no código.
- Falhas ao carregar restrições impedem a tentativa e preservam os campos; nunca equivalem a calendário livre.
- Congelar os dados da tentativa durante a operação, impedir submissões simultâneas no mesmo fluxo e descartar respostas antigas de carregamento.
- Recalcular com dados persistidos recentes após as etapas assíncronas de preparação e imediatamente antes da primeira escrita. A cópia antiga de folgas da interface não será somada à leitura atual.

### 3. Modal de período insuficiente
Usar os diálogos e as cores existentes do Bloom, com textos via `t()` em PT/EN, leitura clara dos três valores e disposição adaptada ao celular.

- **Editar planejamento:** voltar ao formulário com quantidade, datas e horários intactos; foco no campo de período. A próxima tentativa recalcula tudo.
- **Fechar/cancelar:** nenhum registro criado e nenhum campo descartado; Escape também cancela o alerta.
- **Reiniciar planejamento:** pedir confirmação antes de descartar campos preenchidos; cancelar essa confirmação preserva tudo. Confirmar limpa o rascunho e retorna ao início do formulário, sem reutilizar a configuração descartada. Não apaga aulas existentes, contratos ou cadastro do aluno/turma.
- Manter o formulário montado durante alerta/edição para que os efeitos de abertura não sobrescrevam o rascunho. Garantir foco apropriado, retorno de foco e navegação por teclado.

### 4. Sucesso somente após confirmação da quantidade salva
- Não anunciar sucesso, fechar o formulário nem atualizar a tabela com uma geração somente local ou incompleta.
- Na geração individual, exigir vínculo para cada ocorrência e confirmação do salvamento; escrever o cache da geração apenas após sucesso remoto, respeitando o isolamento por professor existente no projeto.
- Na geração de turma, conferir os eventos e planos correspondentes **a esta tentativa**, em vez de usar o total de planos antigos como prova de sucesso.
- Em falhas posteriores à criação de eventos, preservar os IDs já confirmados e reutilizá-los ao tentar novamente; não reinserir toda a sequência, apagar história ou sobrescrever conteúdo de planos existentes.
- Tratar erros nas leituras de deduplicação como erros. Preservar a associação de aulas remarcadas à ocorrência original e o upsert por `event_id`.
- Manter essa proteção no caminho de geração: edições de conteúdo, presença, reagendamento automático, projeção da Agenda e fechamento de planos ficam fora do escopo.

## Limite de segurança sem alterações no banco
A solução bloqueia insuficiência antes de qualquer escrita, relê as restrições antes do salvamento e evita duplicações nas novas tentativas do mesmo fluxo. Contudo, as gravações atuais são requisições separadas, não uma transação.

**Sem trabalho adicional autorizado no banco, não é possível prometer atomicidade entre eventos e planos, nem eliminar completamente uma alteração simultânea de folgas ou duas gerações em abas distintas.** Uma falha de rede após criar eventos pode deixá-los aguardando a recuperação do plano; isso será apresentado como erro, nunca como sucesso. Garantia absoluta nesses cenários exigiria uma operação transacional e proteção de concorrência no banco, a discutir separadamente — nenhum SQL será criado ou executado nesta etapa.

## Detalhes técnicos e escopo
Arquivos principais: os dois formulários de geração, `lesson-plan-sync.ts`, `lesson-plans.ts`, `lesson-plan-period.ts` e os dicionários PT/EN. Adicionar um pequeno helper puro de resultado/quantidade e um diálogo compartilhado, preservando os formatos específicos de individual e turma. Registrar a fronteira entre geração e edição nas convenções do projeto.

Não alterar contratos, pacotes, quantidade contratada, períodos acadêmicos do cadastro, regras de disponibilidade, esquema, políticas de acesso ou outros módulos. A quantidade utilizada será a escolhida pelo professor neste planejamento; nenhum ajuste comercial será inferido.

## Validação prevista
1. Exatamente a quantidade solicitada: geração completa, sem alerta.
2. Mais datas elegíveis: gerar somente a quantidade solicitada.
3. Período insuficiente: mostrar os três valores reais e realizar zero escritas/cache de geração.
4. Nenhuma ocorrência elegível: alertar com zero possíveis e realizar zero escritas.
5. Feriados, férias, recessos e folgas: testar limites inclusivos e exclusões reais.
6. Frequências de 1, 2, 3 ou mais blocos, múltiplos dias e blocos no mesmo dia; preservar a diferença entre aviso e bloqueio.
7. Editar/fechar após alerta: preservar os valores; nova tentativa usa os dados alterados.
8. Reiniciar: cancelar preserva tudo; confirmar limpa somente o rascunho.
9. Falha de leitura, restrições alteradas durante preparação, submissão repetida e retry após falha: sem falso sucesso nem reinserção de eventos já confirmados.
10. Confirmar quantidade exata por ocorrências/IDs no retorno persistido; planos históricos não contam como novas aulas.

Executar os testes focados nos geradores e na operação de geração; verificar os diálogos reais em PT/EN, desktop/celular e teclado; conferir a compilação automática. Testes com dados controlados serão identificados como tal: não substituem salvamento/leitura com uma conta real autenticada.

## Estado desta entrega
Investigação concluída; **nenhuma funcionalidade implementada e nenhum SQL executado**. Os 9 testes existentes de geração de turmas e período individual passaram; a compilação automática atual está OK. A aplicação das proteções e os novos testes dependem da aprovação deste plano.