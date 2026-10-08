# Padronizar o idioma em toda a Bloom

## Objetivo
Migrar para o i18n todos os textos visíveis restantes em português ou inglês e traduzir somente a apresentação de valores internos, preservando os valores canônicos, regras e dados.

## Implementação
- Auditar rotas, modais, menus, tooltips, placeholders, estados vazios, filtros, selects, dialogs, mensagens de sucesso/validação e rótulos de acessibilidade.
- Organizar novas chaves nos dicionários `pt` e `en`, mantendo as duas árvores com as mesmas chaves.
- Substituir literais e ternários de idioma por `t()`/`fmt()` nas áreas Hoje, Alunos, Agenda, Financeiro, Crescimento, Perfil, Configurações, Comunidade, Leads e componentes compartilhados.
- Criar mapeamentos de exibição para enums e valores canônicos como `Private`, `Group`, presença, modalidade, status, foco e origem; os valores enviados e armazenados permanecem inalterados.
- Não migrar logs, nomes técnicos internos, conteúdo do usuário nem valores universais como CEFR, URLs, moedas e marcas.

## Validação
- Conferir paridade de chaves entre português e inglês.
- Repetir a busca global para contabilizar exceções restantes e registrar os totais por área.
- Executar os testes existentes e a verificação de tipos.
- Verificar visualmente as principais telas nos dois idiomas, sem alterar banco, migrations ou dados.
