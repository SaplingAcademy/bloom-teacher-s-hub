# Bloom — Etapa 1: contratos dos alunos

## Diagnóstico

- O perfil do aluno já possui a aba **Contratos**, com histórico, status, novo contrato, anexos posteriores, visualização e download por URL assinada.
- Os tipos e acessos já esperam `student_contracts`, `student_contract_documents` e o bucket privado `contracts`; não há SQL dessas estruturas no repositório. O comentário “manually applied” no código não confirma o que está instalado.
- O formulário de aluno já tem datas **acadêmicas**, mas elas alimentam `students.course_start_date/course_end_date` e os planos de aula. Não serão reutilizadas como datas jurídicas nem misturadas com `student_packages`.
- Faltam: datas contratuais obrigatórias somente para novos alunos, upload opcional no cadastro, transição atômica do contrato atual e validação de tipo/tamanho dos arquivos.

## Menor alteração proposta

1. Adicionar um bloco contratual ao cadastro de **novo aluno**, com início e término obrigatórios, término estritamente posterior ao início e anexo opcional. A edição de alunos antigos continua permitindo contratos ausentes.
2. Depois de salvar o aluno, criar seu primeiro contrato e ativá-lo pela operação transacional proposta. Se o anexo falhar, manter aluno e contrato salvos, informar o erro e permitir anexar depois sem criar duplicatas.
3. Reutilizar a aba Contratos existente. “Novo contrato” preservará o registro anterior, marcará o atual como `renewed`, ligará `previous_contract_id` e ativará o novo. Os valores de status continuam canônicos; apenas seus rótulos são traduzidos.
4. Aceitar somente PDF, JPG e PNG, com limite proposto de **10 MB**, no bucket privado. Visualização e download continuarão usando URLs assinadas de curta duração.
5. Não implementar alertas, renovação nas Prioridades ou integração com o Dashboard.

## SQL para revisão

O SQL completo está em `docs/migrations/20261107060000_student_contracts_manual.sql` e **não foi executado**. Ele contém tabelas, grants, índices, validações, RLS, transição atômica e políticas de Storage.

- É um script de **instalação nova**. Se as tabelas já existirem, ele não deve ser aplicado; será necessário reconciliar as definições reais e preparar uma versão incremental.
- O bucket `contracts` será criado separadamente pela Storage API, somente após autorização, como privado e com o mesmo limite/tipos do SQL.
- Nenhuma coluna de alunos, pacote, cobrança ou dado histórico será alterada.

## Verificação posterior

Somente testes focados de datas, renovação sem duplicidade, arquivos e isolamento por professor, além da compilação. A verificação real de RLS/Storage dependerá de uma sessão autenticada e da aplicação manual autorizada.

Nenhuma alteração de interface ou banco foi implementada nesta revisão.
