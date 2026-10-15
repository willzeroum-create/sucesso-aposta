-- Sucesso Aposta — colar UMA VEZ no Supabase: SQL Editor → New query → colar → Run.
-- Cria a função que o painel usa para falar com a base de dados através da API (só com a chave de servidor).
-- As tabelas são criadas depois automaticamente pelo painel.

create or replace function public.sa_exec(query text, array_mode boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  head text := lower(left(ltrim(query), 10));
  result json;
begin
  if head like 'select%' or head like 'with%' or head like 'values%' then
    if array_mode then
      execute format('select coalesce(json_agg((select json_agg(e.value order by e.n) from json_each(to_json(t)) with ordinality e(key, value, n))), ''[]''::json) from (%s) t', query) into result;
    else
      execute format('select coalesce(json_agg(t), ''[]''::json) from (%s) t', query) into result;
    end if;
  elsif query ~* '\mreturning\M' then
    if array_mode then
      execute format('with t as (%s) select coalesce(json_agg((select json_agg(e.value order by e.n) from json_each(to_json(t)) with ordinality e(key, value, n))), ''[]''::json) from t', query) into result;
    else
      execute format('with t as (%s) select coalesce(json_agg(t), ''[]''::json) from t', query) into result;
    end if;
  else
    execute query;
    result := '[]'::json;
  end if;
  return result;
end;
$fn$;

-- Só a chave de servidor (service_role) pode usar esta função; o público nunca.
revoke all on function public.sa_exec(text, boolean) from public, anon, authenticated;
grant execute on function public.sa_exec(text, boolean) to service_role;

notify pgrst, 'reload schema';
