-- Bloom — Etapa 2A: acesso individual à Biblioteca (APLICAÇÃO MANUAL)
-- Pré-requisito: user_roles, has_role e teacher_subscriptions já existentes.
-- Executar todo o script no SQL Editor. Nenhuma tabela/policy de outras áreas é alterada.
-- Apenas classificações; o conteúdo original dos modelos permanece no servidor.
begin;

create table if not exists public.library_resource_access (
  resource_id text primary key check (length(resource_id) between 1 and 200),
  access_level text not null default 'free' check (access_level in ('free', 'pro')),
  updated_at timestamptz not null default now()
);
grant select on public.library_resource_access to authenticated;
grant all on public.library_resource_access to service_role;
revoke insert, update, delete on public.library_resource_access from authenticated;
revoke all on public.library_resource_access from anon;
alter table public.library_resource_access enable row level security;
drop policy if exists "Authenticated read library classifications" on public.library_resource_access;
create policy "Authenticated read library classifications"
  on public.library_resource_access for select to authenticated
  using (auth.uid() is not null);

-- Não sobrescreve classificações já alteradas se o script for reexecutado.
insert into public.library_resource_access (resource_id, access_level) values
  ('admin-student-contract', 'free'),
  ('admin-parent-contract', 'free'),
  ('admin-corporate-contract', 'free'),
  ('admin-private-agreement', 'free'),
  ('admin-invoice', 'free'),
  ('admin-receipt', 'free'),
  ('admin-payment-agreement', 'free'),
  ('admin-refund-form', 'free'),
  ('admin-price-list', 'free'),
  ('admin-welcome', 'free'),
  ('admin-reminder', 'free'),
  ('admin-renewal', 'free'),
  ('admin-cancellation', 'free'),
  ('admin-follow-up', 'free'),
  ('admin-policies', 'free'),
  ('ped-placement-test', 'free'),
  ('ped-speaking-rubric', 'free'),
  ('ped-progress-report', 'free'),
  ('ped-semester-report', 'free'),
  ('ped-student-goals', 'free'),
  ('ped-semester-planner', 'free'),
  ('ped-course-certificate', 'free'),
  ('ped-attendance-certificate', 'free')
on conflict (resource_id) do nothing;

-- Novos IDs não classificados são Free por contrato; não são gravados ao abrir.
-- Nenhum parâmetro de plano/papel/professor é aceito do navegador.
create or replace function public.assert_library_resource_access(_resource_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_access text;
begin
  if v_user is null then
    raise exception 'LIBRARY_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if _resource_id is null or length(_resource_id) not between 1 and 200 then
    raise exception 'INVALID_LIBRARY_RESOURCE' using errcode = '22023';
  end if;

  select access_level into v_access
  from public.library_resource_access where resource_id = _resource_id;
  -- Ausência confirmada é Free; erros de consulta nunca são convertidos em Free.
  v_access := coalesce(v_access, 'free');
  if v_access = 'free' then return v_access; end if;
  if public.has_role(v_user, 'super_admin') or exists (
    select 1 from public.teacher_subscriptions
    where teacher_id = v_user and plan = 'pro'
  ) then
    return v_access;
  end if;
  raise exception 'LIBRARY_PREMIUM_REQUIRED' using errcode = '42501';
end;
$$;
revoke all on function public.assert_library_resource_access(text) from public, anon;
grant execute on function public.assert_library_resource_access(text) to authenticated;

-- Alteração exclusivamente pela RPC autorizada; retorna a classificação salva.
create or replace function public.set_library_resource_access(_resource_id text, _access_level text)
returns table (resource_id text, access_level text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if _resource_id is null or length(_resource_id) not between 1 and 200 then
    raise exception 'INVALID_LIBRARY_RESOURCE' using errcode = '22023';
  end if;
  if _access_level is null or _access_level not in ('free', 'pro') then
    raise exception 'INVALID_LIBRARY_ACCESS' using errcode = '22023';
  end if;
  insert into public.library_resource_access as existing (resource_id, access_level)
  values (_resource_id, _access_level)
  on conflict on constraint library_resource_access_pkey
  do update set access_level = excluded.access_level, updated_at = now();
  return query select a.resource_id, a.access_level
    from public.library_resource_access a where a.resource_id = _resource_id;
end;
$$;
revoke all on function public.set_library_resource_access(text, text) from public, anon;
grant execute on function public.set_library_resource_access(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
