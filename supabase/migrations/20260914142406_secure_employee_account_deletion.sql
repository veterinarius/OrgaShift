-- Remove the legacy ownership shortcut: user_id is not an authorization role.
drop policy if exists own_employees_all on public.employees;
drop policy if exists org_admin_employees_all on public.employees;

create policy employees_admin_select on public.employees for select to authenticated
using (public.current_user_is_org_admin(organization_id));
create policy employees_admin_insert on public.employees for insert to authenticated
with check (public.current_user_is_org_admin(organization_id) and user_id = (select auth.uid()));
create policy employees_admin_update on public.employees for update to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));
create policy employees_admin_delete on public.employees for delete to authenticated
using (public.current_user_is_org_admin(organization_id));

-- Keep employees_self_select for the employee's own read access.
-- Table privileges override column privileges, so remove both before granting
-- only the fields used by the personnel form. Auth links are backend-only.
revoke all on public.employees from public, anon, authenticated;
do $$
declare cols text;
begin
    select string_agg(quote_ident(attname), ', ') into cols
    from pg_attribute where attrelid = 'public.employees'::regclass
      and attnum > 0 and not attisdropped;
    execute format('revoke all (%s) on public.employees from public, anon, authenticated', cols);
end $$;
grant select, delete on public.employees to authenticated;
grant insert (user_id, organization_id, code, name, title, first_name, last_name,
    role, email, phone, birth_date, start_date, postal_code, city, street,
    house_number, remarks, vacation_days_per_year, weekly_hours_limit,
    must_change_password) on public.employees to authenticated;
grant update (code, name, title, first_name, last_name, role, email, phone,
    birth_date, start_date, postal_code, city, street, house_number, remarks,
    vacation_days_per_year, weekly_hours_limit) on public.employees to authenticated;
