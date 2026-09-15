-- Browser clients may edit presentation fields, not ownership or billing.
-- Revoke table AND column grants: a table-level UPDATE overrides column bans.
revoke update on public.organizations from public, anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ') into cols
  from pg_attribute where attrelid = 'public.organizations'::regclass
    and attnum > 0 and not attisdropped;
  execute format('revoke update (%s) on public.organizations from public, anon, authenticated', cols);
end $$;
grant update (name, logo_url, brand_color) on public.organizations to authenticated;
-- Existing RLS still restricts edits to organization admins. Owner-only tariff
-- changes remain available through set_org_tier (SECURITY DEFINER). Backend
-- maintenance and the ownership FK's ON DELETE SET NULL remain unaffected.
