-- READ-ONLY simulation. Run AFTER section 0 of 20260816000000 (the functions) and BEFORE the DDL/backfill.
with conv as (
  select
    o.teacher_id,
    public.bloom_availability_from_onboarding(o.answers) as computed,
    s.teacher_id is not null as has_settings,
    coalesce(jsonb_array_length(coalesce(s.working_availability, '[]'::jsonb)), 0) > 0 as already_configured
  from public.onboarding o
  left join public.settings s on s.teacher_id = o.teacher_id
)
select
  count(*) as total_onboarding,
  count(*) filter (where already_configured) as preservados,
  count(*) filter (where computed is null and not already_configured) as ignorados_dados_insuficientes,
  count(*) filter (where computed is not null and not already_configured and has_settings) as serao_atualizados,
  count(*) filter (where computed is not null and not already_configured and not has_settings) as serao_inseridos
from conv;

select o.teacher_id,
       o.answers->'working_days' as working_days,
       o.answers->'same_availability_all_days' as same_all,
       o.answers->'unified_availability' as unified,
       o.answers->'custom_availability' as custom,
       public.bloom_availability_from_onboarding(o.answers) as resultado
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is not null
limit 10;

select o.teacher_id, o.answers
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is null
limit 10;
