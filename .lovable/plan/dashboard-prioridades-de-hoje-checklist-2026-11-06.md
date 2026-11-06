# Dashboard: Prioridades de Hoje + Checklist

## 1. Layout proposto

- Preservar saudação e os quatro resumos atuais.
- Na área seguinte, colocar **Prioridades de Hoje à esquerda (2/3)** e **Checklist à direita (1/3)**, alinhados pelo topo.
- Usar duas colunas apenas em desktops com espaço suficiente; abaixo disso, empilhar Prioridades e Checklist. Considerar a largura ocupada pelo menu lateral.
- Manter os tamanhos atuais dos textos. Permitir quebra dos filtros e do cabeçalho das Prioridades, sem esconder categorias.
- O Checklist terá adição rápida no topo, contador de pendentes e lista com altura máxima e rolagem interna. As Prioridades não terão sua altura ou quantidade de registros limitadas por essa mudança.
- Preservar o bloco de atenção urgente existente abaixo da nova área.

## 2. Armazenamento: nova tabela isolada

**Não há estrutura existente adequada para reutilizar sem alterar outros módulos.**

| Estrutura encontrada | Por que não reutilizar |
| --- | --- |
| `tasks` | Compartilhada com CRM e automações. As Prioridades consultam tarefas pendentes por professor; a leitura não distingue um checklist pessoal. |
| Tarefas antigas do Dashboard | Salvas em armazenamento do navegador, incompatível com a persistência solicitada. Também há lógica legada ligada ao calendário. Não importar nem modificar esses registros nesta entrega. |
| `workspace_project_items` | Cada item pertence a um projeto; reaproveitar exigiria misturar ou alterar Projetos. |
| `workspace_notes` e páginas de cadernos | Modelam notas/documentos, não tarefas pessoais independentes. |

Proposta: **`public.teacher_checklist_items`**, sem vínculos com Leads, Projetos, calendário ou automações.

Esta conclusão se baseia no código e nos arquivos de definição disponíveis. A estrutura real do banco não foi consultada; o SQL abaixo é uma proposta para revisão, não uma migração aplicada.

### SQL proposto — não executado

Nome sugerido: `20261106000100_teacher_checklist_manual.sql`.

O script já ativa RLS. A criação deve ser manual, após autorização. Não há importação, limpeza ou alteração de dados existentes.

```sql
BEGIN;

CREATE TABLE public.teacher_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_checklist_title_not_blank
    CHECK (length(btrim(title)) > 0)
);

REVOKE ALL ON TABLE public.teacher_checklist_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.teacher_checklist_items
  TO authenticated;
GRANT INSERT (id, teacher_id, title, completed)
  ON TABLE public.teacher_checklist_items TO authenticated;
GRANT UPDATE (title, completed)
  ON TABLE public.teacher_checklist_items TO authenticated;
GRANT ALL ON TABLE public.teacher_checklist_items TO service_role;

ALTER TABLE public.teacher_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_checklist_select_own
  ON public.teacher_checklist_items
  FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_insert_own
  ON public.teacher_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_update_own
  ON public.teacher_checklist_items
  FOR UPDATE TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_delete_own
  ON public.teacher_checklist_items
  FOR DELETE TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

CREATE INDEX teacher_checklist_owner_completion_created_idx
  ON public.teacher_checklist_items
  (teacher_id, completed, created_at, id);

CREATE FUNCTION public.touch_teacher_checklist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_teacher_checklist_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER teacher_checklist_updated_at
  BEFORE UPDATE ON public.teacher_checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_teacher_checklist_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
```

**Segurança:** usuários autenticados leem e alteram apenas suas próprias linhas. Nas atualizações, podem modificar somente texto e conclusão, não autoria ou identificadores. Não há acesso anônimo. O gatilho não usa privilégios elevados. O conteúdo será texto simples, sem HTML.

## 3. Arquivos previstos

### Modificar
- `src/routes/_app.index.tsx`: colocar os dois cartões na nova grade; preservar os demais blocos e fluxos.
- `src/components/bloom/DailyPrioritiesCard.tsx`: ajustes de apresentação necessários ao espaço menor, principalmente cabeçalho e quebra de textos; sem mudar consultas ou regras.
- `src/lib/i18n-ui.ts`: textos PT/EN do Checklist, confirmações e erros.

### Criar
- `src/components/bloom/ChecklistCard.tsx`: adição, edição, conclusão/desfazer, exclusão, confirmação de limpeza, estados vazio/erro e skeleton usando os controles existentes.
- `src/hooks/use-teacher-checklist.ts`: consulta e operações otimistas com React Query, isoladas por professor.
- `src/lib/teacher-checklist.ts`: tipos, validação e ordenação pendentes primeiro, concluídas depois.
- `src/lib/teacher-checklist-data.ts`: acesso pelo cliente de sessão existente, com verificação de identidade e filtros por professor e item.
- `tests/teacher-checklist.test.ts` e `tests/teacher-checklist-data.test.ts`: regressões focadas de ordenação, ações, erros e isolamento.
- O script manual acima, se sua preparação for autorizada, em `docs/migrations/`.

Reutilizar `Button`, `Input`, `Checkbox`, diálogo de confirmação e `Skeleton`; não será necessário alterar estilos globais, autenticação ou navegação.

## 4. Riscos e proteções

- **Misturar tarefas pessoais com Prioridades:** evitado pela tabela e cache exclusivos. Operações do Checklist não invalidarão o cache das Prioridades nem executarão automações.
- **Perder as otimizações recentes:** manter `useDailyPrioritiesQuery` e a chave por professor/dia intactos. A nova consulta começa em paralelo, sem bloquear Prioridades.
- **Cliques rápidos e falhas:** atualização visual imediata, gravações coordenadas, resposta antiga nunca substitui edição nova; falhas revertem apenas a operação afetada e mostram erro. Identificador de criação permanece estável em tentativas repetidas.
- **Limpeza concorrente:** ao confirmar, excluir apenas os IDs apresentados que ainda estiverem concluídos, sempre do professor autenticado; não apagar itens desmarcados nem novas conclusões fora da confirmação.
- **Troca de conta:** cache por professor, nenhuma cópia local usada como persistência; leituras e gravações validam a sessão.
- **Cartão estreito ou alto demais:** filtros e textos quebram naturalmente; empilhar quando necessário e limitar somente a lista interna do Checklist.
- **Tabela ainda não aplicada:** não apresentar tarefas falsas ou sucesso local. A implantação funcional depende da aplicação manual do SQL; sem ela, a leitura deve informar erro.

## Sequência após aprovação

1. Autorizar a preparação final do SQL e executá-lo manualmente; nenhuma execução automática.
2. Após confirmação da aplicação, implementar o layout e o Checklist no escopo acima.
3. Executar somente testes focados e verificar desktop/celular, teclado, erros, persistência após recarregar e isolamento entre contas quando houver sessão de teste disponível.

**Nesta análise, nenhuma interface, regra de negócio ou estrutura do banco foi alterada; nenhum SQL, teste, build manual ou auditoria foi executado.**