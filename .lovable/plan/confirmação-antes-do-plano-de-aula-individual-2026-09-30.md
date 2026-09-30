# Confirmação antes do plano de aula individual

## O que será feito
- Inserir uma confirmação antes de abrir o gerador de plano individual.
- Aplicar a confirmação aos dois acessos existentes: **Gerar plano de aulas** e **Regerar Plano**.
- Manter visualização, edição, histórico e conclusão de planos sem mudanças.
- Adicionar os textos fornecidos em português e inglês ao sistema de tradução existente.

## Comportamento
- **Está tudo certo, continuar** fecha a confirmação e abre o gerador atual, sem iniciar a geração antecipadamente.
- **Revisar calendário** fecha a confirmação, não gera nada e leva à Agenda com **Configurar Disponibilidade** aberta.
- A Agenda reconhecerá um parâmetro de navegação para abrir a configuração existente; nenhuma segunda configuração será criada.

## Detalhes técnicos
- Criar um diálogo pequeno e reutilizável para a confirmação.
- Integrá-lo em `StudentLessonPlanTable`, que concentra os dois pontos de entrada do gerador individual.
- Permitir que `/calendar` abra `CentralAvailabilityModal` diretamente na aba de horários de trabalho, onde também ficam pausas e dias sem aula.
- Não alterar geração, persistência, calendário, banco de dados ou planos de turmas/duplas.

## Validação
- Executar `npx tsc --noEmit`.
- Conferir o fluxo no navegador: confirmação → continuar → gerador; confirmação → revisar → Agenda/disponibilidade.
