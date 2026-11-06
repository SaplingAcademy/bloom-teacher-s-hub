# Bloom Workspace — Entrega 5: Cadernos digitais

## Arquivos

Criados:
- `src/lib/workspace-notebooks.ts`
- `src/lib/workspace-notebooks-data.ts`
- `src/lib/notebook-autosave.ts`
- `src/hooks/use-workspace-notebooks.ts`
- `src/components/bloom/workspace/notebook-appearance.ts`
- `src/components/bloom/workspace/NotebookDialog.tsx`
- `src/components/bloom/workspace/NotebooksList.tsx`
- `src/components/bloom/workspace/NotebookDetailView.tsx`
- `src/components/bloom/workspace/NotebookRichEditor.tsx`
- `tests/workspace-notebooks.test.ts`
- `tests/workspace-notebooks-data.test.ts`
- `tests/notebook-autosave.test.ts`
- Este relatório.

Modificados:
- `src/routes/_app.workspace.notebooks.tsx`
- `src/routes/_app.workspace.notebooks_.$notebookId.tsx`
- `src/lib/i18n-ui.ts`
- `src/styles.css` (somente estilos adicionais do editor)
- `src/components/bloom/workspace/AGENTS.md`, `roadmap.md`
- `package.json`, `bun.lock` (dependências do editor).

## Editor e funcionalidades

Tiptap 3, StarterKit e extensões TaskList/TaskItem, carregados sob demanda. Texto normal, negrito, itálico, sublinhado, títulos H1–H3, listas, checklists, links HTTP(S), desfazer/refazer e atalhos nativos.

Lista de cadernos com criar/editar/excluir, título obrigatório, descrição opcional, cores/ícones, quantidade de páginas e atualização mais recente — incluindo a atividade das páginas. Exclusões confirmadas. Páginas com criação, renomeação, duplicação, fixação, ordenação acessível para início/fim do grupo e exclusão. Desktop com lista à esquerda; celular alterna páginas/editor. Traduções PT/EN, skeletons, erros e estados vazios.

## Salvamento e integridade

Debounce de 700 ms. Uma gravação por vez por sessão do caderno; documentos locais separados por página permanecem disponíveis durante trocas e falhas. Salva `content_json` validado e `plain_preview` derivado do texto. Uma resposta anterior não substitui edições mais recentes; “Salvo” aparece somente após confirmação da gravação. Falhas preservam texto, exibem erro e oferecem tentativa novamente.

Trocar páginas dispara a gravação pendente sem perder o rascunho da anterior. Sair pela navegação com alterações pendentes oferece continuar editando ou salvar e sair; falha impede a saída. Fechar/recarregar usa aviso nativo. Operações de metadados aguardam o conteúdo salvo e bloqueiam temporariamente a edição para evitar alterações durante exclusões. Cliques repetidos são bloqueados; criação/duplicação conservam UUID nas tentativas incertas.

Autenticação revalidada em cada operação; leituras/gravações filtradas por proprietário e, para páginas, caderno/ID. Nenhuma atualização envia `user_id`/`notebook_id`. RLS e FK existentes continuam sendo a proteção no banco. Documentos não reconhecidos geram erro sem regravar o original. HTML arbitrário não é renderizado; links inseguros são removidos.

## Testes e resultado

65 testes em seis arquivos, todos aprovados: 30 novos testes de domínio, persistência e autosave; 17 testes existentes do Mural e 18 de Projetos.

Verificação visual isolada com componentes reais e persistência simulada: CRUD, duplicação, fixação/ordenação, formatação/checklist, links válidos/inválidos, gravações lentas, trocas rápidas, erro/recuperação, bloqueio de navegação e leitura ao reabrir. PT/EN; 1280×1800, 800×537 e 390×844. Sem erros de execução; compilação automática do preview aprovada. Nenhum build manual ou teste amplo executado.

## Limitações

- A verificação com professor autenticado e gravações/RLS reais não foi possível: a aplicação local redireciona para `/auth` e não existe sessão externa disponível. Os testes isolados não substituem essa confirmação.
- Rascunhos ficam em memória enquanto o editor está aberto. Se o professor ignorar o aviso nativo e fechar/recarregar durante falha, alterações não confirmadas podem ser perdidas; não existe armazenamento local apresentado como gravação bem-sucedida.
- A serialização evita concorrência dentro desta sessão; edição simultânea em duas abas/dispositivos não tem resolução transacional de conflitos nesta entrega.
- Documentos com tipos fora do editor permitido são rejeitados, preservando o original para diagnóstico.

Nenhum SQL foi executado ou necessário. Tabelas, RLS, autenticação, Mural, Projetos e demais módulos permaneceram intactos. Colaboração, permissões, cotas e uploads não foram implementados.