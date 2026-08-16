-- Bloom: suporte a centavos nos valores de Planos / Pacotes
-- packages.price era integer (bloqueava 2500.52). Passa a numeric(12,2),
-- preservando integralmente os valores existentes (2500 -> 2500.00).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'packages'
      and column_name = 'price'
      and data_type in ('integer', 'bigint', 'smallint')
  ) then
    alter table public.packages
      alter column price type numeric(12,2) using price::numeric(12,2);
  end if;
end $$;

comment on column public.packages.price is 'Valor do pacote em reais, com centavos (numeric(12,2))';
