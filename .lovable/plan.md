# Conectar o Bloom ao projeto Supabase existente (OAuth)

## Objetivo
Ligar este projeto Lovable ao projeto Supabase que o código já usa — sem criar projeto novo e sem tocar em banco, schema, RLS, Auth, Edge Functions ou dados.

## Estado atual (verificado)
- O código já usa Supabase: `src/lib/supabase.ts`, `src/hooks/use-auth.ts`, `src/routes/auth.tsx`.
- O Preview quebra com: `Missing Supabase environment variables` — faltam `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Não há nenhuma conexão de conector ativa neste workspace.
- A integração Supabase externa existe e é ativada por OAuth em Project Settings → Integrations. Não existe ferramenta de agente para disparar esse fluxo: só você pode concluí-lo na interface.

## Passos

### 1. Você conecta via OAuth (única ação manual)
Project Settings → Integrations → Supabase → autorizar e selecionar o projeto Supabase **já existente**. Não criar projeto novo.

Ao concluir, o Lovable injeta as variáveis de ambiente do projeto conectado.

### 2. Conferir o mínimo necessário para o Preview
Requisito mínimo, e apenas isso:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`, conforme o nome injetado)

Se a integração injetar a chave com o nome publishable e o código esperar `VITE_SUPABASE_ANON_KEY`, o ajuste será feito **apenas** em `src/lib/supabase.ts`, aceitando ambos os nomes no fallback de leitura. Nenhuma outra mudança de código.

### 3. Regra de segurança da service role
- `SUPABASE_SERVICE_ROLE_KEY` fica exclusivamente como segredo de servidor.
- Nunca em variável `VITE_*`, nunca importada em componente, hook ou rota do cliente.
- Não será usada nesta etapa: não há necessidade real, pois todo o acesso atual passa pelo cliente do browser com a anon key e RLS.

### 4. Verificação (somente leitura)
- Recarregar o Preview e confirmar que o erro de variáveis sumiu.
- Confirmar que o cliente Supabase inicializa e que `/auth` renderiza.
- Confirmar no console que não há erro de inicialização.

Nada além disso: sem migrations, sem SQL, sem alteração de RLS, Auth, Edge Functions ou dados.

## Fora de escopo
- Criar projeto Supabase novo.
- Qualquer migration, DDL ou escrita em dados existentes.
- Alterar políticas RLS, provedores de Auth ou Edge Functions.
- Refatorar o fluxo de autenticação ou a UI.

## Critério de sucesso
`src/lib/supabase.ts` inicializa com credenciais reais, o app carrega sem o erro de variáveis de ambiente e a rota `/auth` renderiza normalmente.
